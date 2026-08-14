// ============================================================
// ПРИЛОЖЕНИЕ (Google Earth Engine Code Editor): обзор ударного
// кратера + радиальный профиль высот.
//
// КАК ЗАПУСТИТЬ (для новичка, пошагово):
//   1. Открыть https://code.earthengine.google.com/ и войти под своим
//      Google-аккаунтом (Earth Engine должен быть уже подключён к
//      аккаунту — если нет, сервис сам предложит регистрацию).
//   2. Слева в панели Scripts нажать "New" -> "File", дать имя,
//      например crater_app.
//   3. Стереть содержимое редактора и вставить целиком этот файл.
//   4. Нажать "Run" (кнопка сверху). Слева появится панель управления,
//      справа — карта.
//   5. Выбрать кратер из списка (или ввести долготу/широту вручную) и
//      нажать "Обновить карту".
//
// ВАЖНОЕ ДОПУЩЕНИЕ: координаты в справочнике CRATERS ниже —
// ориентировочные (для быстрого старта). Для точной работы сверяйте
// их со списком: https://en.wikipedia.org/wiki/List_of_impact_structures_on_Earth
// Барринджер (Meteor Crater) взят из вашего исходного скрипта и совпадает
// с общеизвестными координатами (35.027N, 111.0228W).
//
// ВАЖНО ПРО ЭКСПОРТ: кнопки экспорта ставят задачу в очередь — её нужно
// вручную запустить во вкладке "Tasks" (справа вверху редактора),
// нажав "Run" у каждой задачи. Это стандартное поведение Earth Engine,
// автоматического скачивания нет. Если вы опубликуете этот скрипт как
// отдельное Earth Engine App (Apps -> Publish), у других зрителей
// кнопки экспорта работать не будут — Export/Tasks доступны только
// вам, автору, в самом Code Editor.
// ============================================================

// ---------- 1. Справочник кратеров (координаты приближённые) ----------
var CRATERS = {
  'Barringer (Meteor Crater), США': [-111.0228, 35.0270],
  'Chicxulub, Мексика': [-89.5, 21.3],
  'Vredefort, ЮАР': [27.5, -27.0],
  'Sudbury, Канада': [-81.2, 46.6],
  'Manicouagan, Канада': [-68.7, 51.38],
  'Wolfe Creek, Австралия': [127.80, -19.18],
  'Gosses Bluff, Австралия': [132.32, -23.82],
  'Lonar, Индия': [76.51, 19.98],
  'Kaali, Эстония': [22.67, 58.37],
  'Roter Kamm, Намибия': [16.30, -27.77],
  'Pingualuit, Канада': [-73.66, 61.28],
  'Bosumtwi, Гана': [-1.41, 6.51],
  'Ries (Нёрдлинген), Германия': [10.62, 48.88],
  'Tenoumer, Мавритания': [-10.41, 22.92]
};

// ---------- 2. Состояние приложения ----------
var state = {
  name: 'Barringer (Meteor Crater), США',
  lon: -111.0228,
  lat: 35.0270,
  sizeKm: 2.0,       // радиус области интереса, км
  profileKm: 1.5,    // длина радиального профиля, км (должна быть <= sizeKm)
  nAzimuths: 8,      // число лучей профиля
  startDate: '2023-01-01',
  endDate: '2025-12-31',
  demImage: null,
  s2Image: null,
  s1Image: null,
  hillshadeImage: null,
  slopeImage: null,
  aoi: null,
  sampledPoints: null,
  demMin: null,
  demMax: null
};

// ---------- 3. Вспомогательные функции (физика/геометрия) ----------
function maskS2clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(mask).divide(10000);
}

// Порядок предпочтения DEM: лидар 3DEP 1м (только США) -> Copernicus
// GLO-30 (глобально, ~30м, современнее SRTM) -> SRTM (запасной вариант).
// ee.ImageCollection.mosaic() берёт первый НЕЗАМАСКИРОВАННЫЙ пиксель по
// порядку коллекции, поэтому просто перечисляем источники по приоритету.
//
// Источник вроде 3DEP 1м вне США даёт ПУСТУЮ коллекцию (0 снимков) — а
// .mosaic() пустой коллекции возвращает изображение без полос вообще,
// и .rename('DEM') на нём падает с ошибкой (не сразу, а при первом же
// реальном использовании -- например, в ee.Terrain.slope, что и было
// видно как "Image.gradient: Can't get band number 0"). Поэтому вместо
// прямого rename оборачиваем через ee.Algorithms.If: если коллекция
// пуста, подставляем полностью замаскированную заглушку с тем же именем
// полосы -- тогда .mosaic() ниже корректно её пропускает и берёт
// следующий источник по приоритету.
function safeDemSource(collectionId, bandName, aoi) {
  var col = ee.ImageCollection(collectionId).filterBounds(aoi).select(bandName);
  var placeholder = ee.Image.constant(0).toFloat().rename('DEM')
      .updateMask(ee.Image.constant(0));
  var img = ee.Image(ee.Algorithms.If(
      col.size().gt(0), col.mosaic().rename('DEM'), placeholder));
  return img.toFloat();
}

function pickDem(aoi) {
  var lidar = safeDemSource('USGS/3DEP/1m', 'elevation', aoi);
  var glo30 = safeDemSource('COPERNICUS/DEM/GLO30_2024_1', 'DEM', aoi);
  var srtm = ee.Image('USGS/SRTMGL1_003').select('elevation').rename('DEM').toFloat();
  var dem = ee.ImageCollection([lidar, glo30, srtm]).mosaic().clip(aoi);

  // Смешивать в одной мозаике куски с разным исходным разрешением (1 м/30 м)
  // и без единой проекции опасно для террейн-функций (slope/hillshade,
  // internally использующих .gradient() по соседним пикселям) -- это и
  // приводило к пустым slope/hillshade даже там, где DEM выглядел нормально.
  // Явно перепроецируем на фиксированную метровую сетку.
  return dem.reproject({crs: 'EPSG:3857', scale: 10});
}

// Sentinel-1 (радар, GRD): VV и VH поляризации + их разность (VV_VH_diff).
// В отличие от оптики, радар не зависит от облачности и освещённости и
// чувствителен к шероховатости/текстуре поверхности -- вал и осыпи на
// склонах кратера обычно дают более высокое обратное рассеяние (ярче),
// чем ровное дно.
function buildS1(aoi) {
  var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(aoi)
      .filterDate(state.startDate, state.endDate)
      .filter(ee.Filter.eq('instrumentMode', 'IW'))
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
      .select(['VV', 'VH']);
  var comp = ee.Image(ee.Algorithms.If(
      s1.size().gt(0),
      s1.median().clip(aoi),
      ee.Image.constant([0, 0]).rename(['VV', 'VH']).toFloat()
          .updateMask(ee.Image.constant(0)).clip(aoi)
  ));
  var diff = comp.select('VV').subtract(comp.select('VH')).rename('VV_VH_diff');
  return comp.addBands(diff).toFloat();
}

// Точка на расстоянии distanceM по азимуту azimuthDeg от (lon, lat).
// Поправка на широту (cos(lat)) обязательна: без неё восточно-западные
// плечи профиля будут короче заданной длины на местности.
function destinationPoint(lon, lat, azimuthDeg, distanceM) {
  var angRad = azimuthDeg * Math.PI / 180;
  var metersPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
  var metersPerDegLat = 110540;
  var dx = Math.sin(angRad) * distanceM;
  var dy = Math.cos(angRad) * distanceM;
  return [lon + dx / metersPerDegLon, lat + dy / metersPerDegLat];
}

function azimuthLine(lon, lat, azimuthDeg, lengthKm) {
  var end = destinationPoint(lon, lat, azimuthDeg, lengthKm * 1000);
  return ee.Feature(ee.Geometry.LineString([[lon, lat], end]), {azimuth: azimuthDeg});
}

function azimuthSamplePoints(lon, lat, azimuthDeg, lengthKm, stepM) {
  var nSteps = Math.round((lengthKm * 1000) / stepM);
  var feats = [];
  for (var i = 0; i <= nSteps; i++) {
    var d = i * stepM;
    var p = destinationPoint(lon, lat, azimuthDeg, d);
    feats.push(ee.Feature(ee.Geometry.Point(p), {azimuth: azimuthDeg, distance_m: d}));
  }
  return feats;
}

// ---------- 4. Основная функция перерисовки карты ----------
function update() {
  Map.clear();
  Map.setOptions('SATELLITE');

  var center = ee.Geometry.Point([state.lon, state.lat]);
  var aoi = center.buffer(state.sizeKm * 1000).bounds();
  state.aoi = aoi;
  Map.centerObject(aoi, 15);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(aoi).filterDate(state.startDate, state.endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .map(maskS2clouds);
  var s2comp = s2.median().clip(aoi).select(['B2', 'B3', 'B4', 'B8']);
  state.s2Image = s2comp;

  var s1comp = buildS1(aoi);
  state.s1Image = s1comp;

  var dem = pickDem(aoi);
  var hillshade = ee.Terrain.hillshade(dem);
  var slope = ee.Terrain.slope(dem);
  state.demImage = dem;
  state.hillshadeImage = hillshade;
  state.slopeImage = slope;

  // Растяжка цвета DEM по 2–98 перцентилям (устойчивее к выбросам, чем min/max)
  statusLabel.setValue('Считаю статистику рельефа...');
  var demStats = dem.reduceRegion({
    reducer: ee.Reducer.percentile([2, 98]),
    geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true
  }).getInfo();
  state.demMin = demStats['DEM_p2'];
  state.demMax = demStats['DEM_p98'];

  var demPalette = ['08306b', '41b6c4', 'ffffcc', 'fd8d3c', 'bd0026'];

  // Радиальные линии-азимуты (визуальная разметка) + точки выборки
  var azimuths = [];
  var stepDeg = 360 / state.nAzimuths;
  for (var a = 0; a < 360; a += stepDeg) azimuths.push(a);

  var lineFeats = azimuths.map(function(az) {
    return azimuthLine(state.lon, state.lat, az, state.profileKm);
  });
  var lineFC = ee.FeatureCollection(lineFeats);

  var pointFeats = [];
  azimuths.forEach(function(az) {
    pointFeats = pointFeats.concat(
        azimuthSamplePoints(state.lon, state.lat, az, state.profileKm, 30));
  });
  var pointsFC = ee.FeatureCollection(pointFeats);

  var sampled = dem.addBands(slope).addBands(hillshade).addBands(s1comp).reduceRegions({
    collection: pointsFC, reducer: ee.Reducer.first(), scale: 10
  });
  state.sampledPoints = sampled;

  // Слои на карте
  Map.addLayer(aoi, {color: 'yellow'}, 'Зона интереса (AOI)', false);
  Map.addLayer(s2comp, {bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.30, gamma: 1.1},
      'Sentinel-2, естественные цвета', true);
  Map.addLayer(dem, {min: state.demMin, max: state.demMax, palette: demPalette},
      'Рельеф (DEM)', true);
  Map.addLayer(hillshade, {min: 0, max: 255}, 'Отмывка рельефа (hillshade)', true);
  Map.addLayer(slope, {min: 0, max: 30,
    palette: ['ffffff', 'd9f0a3', 'addd8e', '78c679', '31a354', '006837']},
      'Уклон (slope)', false);
  Map.addLayer(s1comp, {bands: ['VV', 'VH', 'VV_VH_diff'], min: [-20, -25, 0], max: [0, -5, 15]},
      'Sentinel-1 (радар, VV/VH/разность)', false);
  Map.addLayer(lineFC, {color: '00FFFF'}, 'Радиальные линии профиля', true);
  Map.addLayer(center, {color: 'red'}, 'Центр кратера', true);

  statusLabel.setValue('Готово: ' + state.name +
      ' | источник DEM определяется автоматически (см. пояснение в коде)');

  // Map.clear() в начале update() стирает не только слои, но и все ранее
  // навешенные обработчики кликов -- поэтому обработчик "уточнить центр"
  // нужно регистрировать заново при каждой перерисовке карты, иначе после
  // первого же "Обновить карту" клики по карте перестают что-либо делать.
  Map.onClick(onMapClick);
}

// ---------- 5. График профиля прямо в Code Editor ----------
function showChart() {
  if (!state.sampledPoints) {
    statusLabel.setValue('Сначала нажмите "Обновить карту".');
    return;
  }
  var chart = ui.Chart.feature.groups({
    features: state.sampledPoints,
    xProperty: 'distance_m',
    yProperty: 'DEM',
    seriesProperty: 'azimuth'
  }).setOptions({
    title: 'Радиальные профили высот: ' + state.name,
    hAxis: {title: 'Расстояние от центра, м'},
    vAxis: {title: 'Высота, м'}
  });
  print(chart);
}

// ---------- 6. Экспорт CSV с профилем (для итогового графика в Python) ----------
function exportCsv() {
  if (!state.sampledPoints) {
    statusLabel.setValue('Сначала нажмите "Обновить карту".');
    return;
  }
  var tag = state.name.replace(/[^a-zA-Z0-9]/g, '_');
  Export.table.toDrive({
    collection: state.sampledPoints,
    description: 'profile_' + tag,
    fileNamePrefix: 'profile_' + tag,
    folder: 'GEE_crater_profiles',
    fileFormat: 'CSV'
  });
  statusLabel.setValue('Задача CSV поставлена в очередь. Откройте вкладку ' +
      '"Tasks" справа вверху и нажмите Run у profile_' + tag + '.');
}

// ---------- 7. Экспорт снимков для презентации ----------
function exportImages() {
  if (!state.demImage) {
    statusLabel.setValue('Сначала нажмите "Обновить карту".');
    return;
  }
  var tag = state.name.replace(/[^a-zA-Z0-9]/g, '_');
  var aoi = state.aoi;
  var demPalette = ['08306b', '41b6c4', 'ffffcc', 'fd8d3c', 'bd0026'];

  Export.image.toDrive({
    image: state.s2Image.visualize({bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.30, gamma: 1.1}),
    description: 'S2_RGB_' + tag, fileNamePrefix: 'S2_RGB_' + tag,
    folder: 'GEE_crater_profiles', region: aoi, scale: 5, maxPixels: 1e10
  });
  Export.image.toDrive({
    image: state.demImage.visualize({min: state.demMin, max: state.demMax, palette: demPalette}),
    description: 'DEM_' + tag, fileNamePrefix: 'DEM_' + tag,
    folder: 'GEE_crater_profiles', region: aoi, scale: 5, maxPixels: 1e10
  });
  Export.image.toDrive({
    image: state.hillshadeImage.visualize({min: 0, max: 255}),
    description: 'Hillshade_' + tag, fileNamePrefix: 'Hillshade_' + tag,
    folder: 'GEE_crater_profiles', region: aoi, scale: 5, maxPixels: 1e10
  });
  Export.image.toDrive({
    image: state.slopeImage.visualize({min: 0, max: 30,
      palette: ['ffffff', 'd9f0a3', 'addd8e', '78c679', '31a354', '006837']}),
    description: 'Slope_' + tag, fileNamePrefix: 'Slope_' + tag,
    folder: 'GEE_crater_profiles', region: aoi, scale: 5, maxPixels: 1e10
  });
  Export.image.toDrive({
    image: state.s1Image.visualize({bands: ['VV', 'VH', 'VV_VH_diff'],
      min: [-20, -25, 0], max: [0, -5, 15]}),
    description: 'S1_VVVH_' + tag, fileNamePrefix: 'S1_VVVH_' + tag,
    folder: 'GEE_crater_profiles', region: aoi, scale: 10, maxPixels: 1e10
  });
  statusLabel.setValue('5 задач экспорта картинок поставлены в очередь. ' +
      'Откройте вкладку "Tasks" и нажмите Run у каждой (S2_RGB_, DEM_, Hillshade_, Slope_, S1_VVVH_ + ' + tag + ').');
}

// ---------- 8. Панель управления (левая колонка "приложения") ----------
var panel = ui.Panel({style: {width: '340px', padding: '8px'}});
panel.add(ui.Label('Обзор ударного кратера', {fontWeight: 'bold', fontSize: '16px'}));
panel.add(ui.Label('Профиль высот через центр, слои со спутника и DEM',
    {fontSize: '12px', color: '666666'}));

var lonBox = ui.Textbox({value: String(state.lon)});
var latBox = ui.Textbox({value: String(state.lat)});

var craterSelect = ui.Select({
  items: Object.keys(CRATERS),
  value: state.name,
  onChange: function(name) {
    state.name = name;
    state.lon = CRATERS[name][0];
    state.lat = CRATERS[name][1];
    lonBox.setValue(String(state.lon));
    latBox.setValue(String(state.lat));
  }
});
panel.add(ui.Label('Кратер из справочника:'));
panel.add(craterSelect);

panel.add(ui.Label('Долгота (можно ввести вручную, если кратера нет в списке):'));
panel.add(lonBox);
panel.add(ui.Label('Широта:'));
panel.add(latBox);

// Координаты из справочника ориентировочные и иногда промахиваются мимо
// центра кратера на снимке (см. пример с Lonar). Эта кнопка позволяет
// поправить центр на глаз: включаете режим, кликаете по центру кратера
// на карте справа -- координаты клика становятся новым центром, и карта
// сама перестраивается.
var pickingCenter = false;
var pickCenterBtn = ui.Button({
  label: 'Уточнить центр кликом по карте',
  onClick: function() {
    pickingCenter = true;
    pickCenterBtn.setLabel('Кликните по центру кратера на карте...');
    statusLabel.setValue('Режим уточнения центра включён: кликните по видимому ' +
        'центру кратера на карте справа.');
  }
});
panel.add(pickCenterBtn);

function onMapClick(coords) {
  if (!pickingCenter) return;
  pickingCenter = false;
  pickCenterBtn.setLabel('Уточнить центр кликом по карте');

  state.lon = coords.lon;
  state.lat = coords.lat;
  lonBox.setValue(String(state.lon));
  latBox.setValue(String(state.lat));
  update();
}

var sizeBox = ui.Textbox({value: String(state.sizeKm)});
panel.add(ui.Label('Радиус области интереса, км:'));
panel.add(sizeBox);

var profBox = ui.Textbox({value: String(state.profileKm)});
panel.add(ui.Label('Длина профиля, км (должна быть <= радиуса):'));
panel.add(profBox);

var azBox = ui.Textbox({value: String(state.nAzimuths)});
panel.add(ui.Label('Число лучей (азимутов) профиля:'));
panel.add(azBox);

var updateBtn = ui.Button({
  label: 'Обновить карту',
  onClick: function() {
    state.name = state.name || 'Пользовательская точка';
    state.lon = parseFloat(lonBox.getValue());
    state.lat = parseFloat(latBox.getValue());
    state.sizeKm = parseFloat(sizeBox.getValue());
    state.profileKm = parseFloat(profBox.getValue());
    state.nAzimuths = parseInt(azBox.getValue(), 10);
    update();
  }
});
panel.add(updateBtn);

panel.add(ui.Button({label: 'Показать график профиля (в Code Editor)', onClick: showChart}));
panel.add(ui.Button({label: 'Экспорт профиля в CSV (Google Drive)', onClick: exportCsv}));
panel.add(ui.Button({label: 'Экспорт снимков для презентации (Google Drive)', onClick: exportImages}));

var statusLabel = ui.Label('Нажмите "Обновить карту", чтобы начать.',
    {fontSize: '12px', color: '444444', whiteSpace: 'pre-wrap'});
panel.add(statusLabel);

// ---------- 9. Сборка "приложения": панель слева + карта справа ----------
ui.root.insert(0, panel);

// Первая отрисовка при запуске скрипта
update();
