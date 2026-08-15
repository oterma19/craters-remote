// ============================================================
// Мультисенсорный сравнительный анализ земных импактных кратеров
// (Google Earth Engine Code Editor).
//
// ЧТО ДЕЛАЕТ ЭТО ПРИЛОЖЕНИЕ И ЧЕГО ОНО НЕ ДЕЛАЕТ (читайте это в первую
// очередь -- этот абзац важнее, чем сам код):
//
//   Приложение анализирует ДИСТАНЦИОННЫЕ диагностические признаки
//   (морфометрию рельефа, спектральные характеристики Sentinel-2,
//   радарный отклик Sentinel-1) и позволяет СРАВНИВАТЬ форму и
//   зональные статистики нескольких кратеров между собой.
//
//   Оно НЕ доказывает и не подтверждает ударное происхождение объекта.
//   Морфологическое и спектральное сходство с известными импактными
//   структурами -- это рабочая гипотеза, а не идентификация. Согласно
//   принятой в литературе методике (Koeberl, 2004), однозначное
//   подтверждение импактного происхождения возможно только по
//   петрографическим/геохимическим признакам ударного метаморфизма
//   (планарные деформационные структуры в кварце, конусы разрушения,
//   высокобарные полиморфы кремнезёма, геохимические аномалии PGE) --
//   то есть по образцам породы, а не по спутниковым данным.
//
//   Радар (Sentinel-1) в этом приложении показывает пространственные
//   различия обратного рассеяния и текстуры поверхности. Эти различия
//   интерпретируются с учётом шероховатости, влажности, геометрии
//   наблюдения (угол падения, направление орбиты) и морфологии рельефа
//   -- НЕ как прямой индикатор удара. Утверждение "вал всегда ярче
//   дна" -- эмпирическое наблюдение по трём объектам, а не общий закон.
//
//   SWIR-каналы Sentinel-2 показывают спектральные различия состава и
//   влажности поверхности, которые ТРЕБУЮТ геологической интерпретации
//   и сами по себе тоже не доказывают удар.
//
// КАК ЗАПУСТИТЬ (для новичка, пошагово):
//   1. Открыть https://code.earthengine.google.com/ и войти под своим
//      Google-аккаунтом.
//   2. Слева в панели Scripts нажать "New" -> "File", дать имя,
//      например crater_app.
//   3. Стереть содержимое редактора и вставить целиком этот файл.
//   4. Нажать "Run". Слева появится панель управления, справа -- карта.
//   5. Выбрать кратер, при необходимости открыть доп. секции панели
//      (DEM, Sentinel-1, Sentinel-2, зоны), нажать "Обновить карту".
//
// ВАЖНОЕ ДОПУЩЕНИЕ: координаты в справочнике CRATERS -- ориентировочные.
// Используйте кнопку "Уточнить центр кликом по карте", если центр не
// совпадает с кратером на снимке.
//
// ВАЖНО ПРО ЭКСПОРТ: кнопки экспорта ставят задачи в очередь -- их
// нужно вручную запустить во вкладке "Tasks" (справа вверху редактора).
// Если вы опубликуете этот скрипт как отдельное Earth Engine App (Apps
// -> Publish), у других зрителей кнопки экспорта работать не будут --
// Export/Tasks доступны только автору в самом Code Editor.
//
// ИЗВЕСТНОЕ ОГРАНИЧЕНИЕ ЭТОЙ ВЕРСИИ: часть вычислений (получение
// радиуса/высоты вала, зональная статистика) выполняется синхронными
// вызовами .getInfo(), поэтому "Обновить карту" может занимать
// несколько секунд -- это сознательный компромисс ради простоты кода,
// а не баг. Полностью асинхронный (callback-based) вариант был бы
// быстрее отзывчивостью интерфейса, но существенно сложнее для чтения
// и доработки.
//
// НЕ РЕАЛИЗОВАНО (честно, а не имитацией): у карты Earth Engine нет
// встроенного виджета "масштабная линейка"/"стрелка на север" -- это
// ограничение платформы, а не недосмотр. Вместо этого масштаб, охват
// и ориентация (азимут 0° = север, по часовой стрелке) явно указаны
// текстом в панели статуса и в экспортируемых метаданных.
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

var CONSISTENT_DEM_ID = 'COPERNICUS/DEM/GLO30_2024_1';
var CONSISTENT_DEM_LABEL = 'Copernicus GLO-30 (единый источник)';

// ---------- 2. Состояние приложения ----------
var state = {
  name: 'Barringer (Meteor Crater), США',
  lon: -111.0228,
  lat: 35.0270,
  sizeKm: 2.0,        // радиус AOI, км
  profileKm: 1.5,      // длина радиального профиля, км
  nAzimuths: 8,
  stepM: 30,
  demMode: 'best',     // 'best' (макс. доступное разрешение) | 'consistent' (единый источник)
  rimSearchMinFrac: 0.2,
  rimSearchMaxFrac: 0.6,
  floorZoneFrac: 0.10,  // центральная зона для оценки дна, доля профиля
  zoneFloorFrac: 0.30,  // границы зон зональной статистики, доли mean_rim_radius
  zoneRimFrac: 1.15,
  zoneEjectaFrac: 1.60,
  s1OrbitMode: 'BOTH',  // 'ASCENDING' | 'DESCENDING' | 'BOTH'
  startDate: '2023-01-01',
  endDate: '2025-12-31',

  // заполняется в update()
  aoi: null,
  demImage: null,
  demSourceLabel: '',
  demScaleM: null,
  demMin: null,
  demMax: null,
  hillshadeImage: null,
  slopeImage: null,
  s2Image: null,
  s2SceneCount: null,
  s1Image: null,
  s1SceneCount: null,
  s1OrbitsUsed: '',
  sampledPoints: null,
  normalizedPoints: null,
  floorElevMedian: null,
  floorElevStd: null,
  meanRimRadius: null,
  rimRadiusStd: null,
  rimRadiusCvPercent: null,
  meanRimElev: null,
  perAzimuth: null,    // {azimuth: {rim_radius_m, rim_elevation_m}}
  zonalStats: null,
  warnings: []
};

// ---------- 3. Геодезические вспомогательные функции ----------
//
// ПОПЫТКА И ОТКАТ (честно, а не имитация): первая версия этой функции
// строила точки через локальную азимутальную равнопромежуточную
// проекцию (AEQD, "+proj=aeqd ...") и просила Earth Engine самого
// пересчитать их в EPSG:4326 -- в теории это точнее плоского
// приближения. На практике конкретный proj4-синтаксис не завёлся в
// Earth Engine ("Projection: The CRS of a map projection could not be
// parsed") и я не могу его отладить вслепую, не имея доступа к
// аутентификации Earth Engine для проверки. Вместо того чтобы гадать
// дальше, возвращаю прежний, ранее реально работавший у вас способ --
// плоское приближение с поправкой на широту (cos(lat)).
//
// ОГРАНИЧЕНИЕ ЭТОГО СПОСОБА: на расстояниях в единицы километров и в
// умеренных широтах ошибка от плоской аппроксимации пренебрежимо мала
// (доли метра на профиль длиной 1.5 км), но она растёт с расстоянием
// от центра и с широтой -- для радиусов в десятки километров или
// приполярных кратеров (например, Pingualuit) её стоит перепроверить.
function destinationPoint(lon, lat, azimuthDeg, distanceM) {
  var angRad = azimuthDeg * Math.PI / 180;
  var metersPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
  var metersPerDegLat = 110540;
  var dx = Math.sin(angRad) * distanceM;
  var dy = Math.cos(angRad) * distanceM;
  return [lon + dx / metersPerDegLon, lat + dy / metersPerDegLat];
}

function buildAzimuthPointsFC(lon, lat, azimuths, lengthKm, stepM) {
  var nSteps = Math.round((lengthKm * 1000) / stepM);
  var feats = [];
  azimuths.forEach(function(az) {
    for (var i = 0; i <= nSteps; i++) {
      var d = i * stepM;
      var p = destinationPoint(lon, lat, az, d);
      feats.push(ee.Feature(ee.Geometry.Point(p), {azimuth: az, distance_m: d}));
    }
  });
  return ee.FeatureCollection(feats);
}

// То же самое, но только конечная точка каждого луча -- для линий
// профиля, отображаемых на карте.
function buildAzimuthLinesFC(lon, lat, azimuths, lengthKm) {
  var feats = azimuths.map(function(az) {
    var end = destinationPoint(lon, lat, az, lengthKm * 1000);
    var line = ee.Geometry.LineString([[lon, lat], end]);
    return ee.Feature(line, {azimuth: az});
  });
  return ee.FeatureCollection(feats);
}

// ---------- 4. Sentinel-2: маска облаков + SWIR-индексы ----------
function maskS2clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(mask).divide(10000).copyProperties(image, image.propertyNames());
}

// Спектральные индексы. НЕ являются диагностикой удара сами по себе --
// показывают различия влажности/состава поверхности, которые нужно
// интерпретировать геологически.
function addS2Indices(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var ndmi = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
  var ratio1112 = image.select('B11').divide(image.select('B12')).rename('B11_B12_ratio');
  return image.addBands([ndvi, ndmi, ratio1112]);
}

// ---------- 5. DEM: два режима, явный источник ----------
// Пустая коллекция (например, лидар вне США) даёт изображение без
// полос при rename() -- это падает не сразу, а при первом реальном
// использовании (например, в ee.Terrain.slope). Оборачиваем через
// ee.Algorithms.If и подставляем замаскированную заглушку с тем же
// именем полосы, чтобы .mosaic() ниже мог её безопасно пропустить.
function safeDemSource(collectionId, bandName, aoi) {
  var col = ee.ImageCollection(collectionId).filterBounds(aoi).select(bandName);
  var placeholder = ee.Image.constant(0).toFloat().rename('DEM')
      .updateMask(ee.Image.constant(0));
  var img = ee.Image(ee.Algorithms.If(
      col.size().gt(0), col.mosaic().rename('DEM'), placeholder));
  return img.toFloat();
}

// Режим "максимальное доступное разрешение": лидар 1 м (США) ->
// Copernicus GLO-30 (~30 м, глобально) -> SRTM (запасной вариант).
function pickDemBest(aoi) {
  var lidar = safeDemSource('USGS/3DEP/1m', 'elevation', aoi);
  var glo30 = safeDemSource('COPERNICUS/DEM/GLO30_2024_1', 'DEM', aoi);
  var srtm = ee.Image('USGS/SRTMGL1_003').select('elevation').rename('DEM').toFloat();
  var dem = ee.ImageCollection([lidar, glo30, srtm]).mosaic().clip(aoi);
  // Смешивать в одной мозаике куски разного исходного разрешения без
  // единой проекции опасно для террейн-функций (slope/hillshade) --
  // явно перепроецируем на фиксированную метровую сетку.
  return dem.reproject({crs: 'EPSG:3857', scale: 10});
}

// Режим "единый DEM для сравнения": один и тот же глобальный источник
// для всех кратеров (по умолчанию Copernicus GLO-30), чтобы разница
// в разрешении между кратерами не искажала сравнение морфометрии.
// SRTM -- запасной вариант, если GLO-30 почему-то недоступен.
function pickDemConsistent(aoi) {
  var glo30 = safeDemSource(CONSISTENT_DEM_ID, 'DEM', aoi);
  var srtm = ee.Image('USGS/SRTMGL1_003').select('elevation').rename('DEM').toFloat();
  var dem = ee.ImageCollection([glo30, srtm]).mosaic().clip(aoi);
  return dem.reproject({crs: 'EPSG:3857', scale: 10});
}

function pickDem(aoi, mode) {
  return mode === 'consistent' ? pickDemConsistent(aoi) : pickDemBest(aoi);
}

// Определяет текстовую метку фактически использованного источника.
// Делает две лёгких (count-only) серверных проверки -- это быстро.
function detectDemSourceLabel(aoi, mode) {
  if (mode === 'consistent') {
    var glo30Count = ee.ImageCollection(CONSISTENT_DEM_ID).filterBounds(aoi).size().getInfo();
    return glo30Count > 0 ? CONSISTENT_DEM_LABEL : 'SRTM (запасной, GLO-30 недоступен)';
  }
  var lidarCount = ee.ImageCollection('USGS/3DEP/1m').filterBounds(aoi).size().getInfo();
  if (lidarCount > 0) return 'USGS 3DEP 1 m (лидар)';
  var glo30Count2 = ee.ImageCollection('COPERNICUS/DEM/GLO30_2024_1').filterBounds(aoi).size().getInfo();
  if (glo30Count2 > 0) return 'Copernicus GLO-30 (~30 м)';
  return 'SRTM (~30 м, запасной вариант)';
}

// ---------- 6. Sentinel-1: направление орбиты, число сцен ----------
function buildS1(aoi, orbitMode, startDate, endDate) {
  var base = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(aoi)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.eq('instrumentMode', 'IW'))
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

  var col = base;
  if (orbitMode === 'ASCENDING' || orbitMode === 'DESCENDING') {
    col = base.filter(ee.Filter.eq('orbitProperties_pass', orbitMode));
  }
  // orbitMode === 'BOTH' -- сознательно смешиваем оба направления;
  // это явно отражается в статусе и имени экспортируемого файла, а не
  // происходит молча.

  col = col.select(['VV', 'VH']);
  var count = col.size().getInfo();

  var comp = ee.Image(ee.Algorithms.If(
      count > 0,
      col.median().clip(aoi),
      ee.Image.constant([0, 0]).rename(['VV', 'VH']).toFloat()
          .updateMask(ee.Image.constant(0)).clip(aoi)
  ));
  var diff = comp.select('VV').subtract(comp.select('VH')).rename('VV_VH_diff');
  return {
    image: comp.addBands(diff).toFloat(),
    sceneCount: count
  };
}

// ---------- 7. Робастная оценка дна и гребня вала ----------
// Раньше "дно" бралось как высота в самой первой точке профиля
// (distance_m = 0) -- один-единственный пиксель, шумный и ненадёжный.
// Теперь берём медиану всех точек всех азимутов в центральной зоне
// (по умолчанию первые 10% длины профиля) -- устойчивее к выбросам и
// локальному шуму DEM.
function computeFloorStats(pointsInfo, floorZoneM) {
  var vals = [];
  pointsInfo.features.forEach(function(f) {
    var d = f.properties.distance_m;
    var h = f.properties.DEM;
    if (d <= floorZoneM && h !== null && h !== undefined) vals.push(h);
  });
  if (vals.length < 3) {
    state.warnings.push(
        'Мало точек в центральной зоне (' + vals.length + ') для устойчивой оценки дна -- ' +
        'увеличьте floorZoneFrac или профиль длиннее.');
  }
  vals.sort(function(a, b) { return a - b; });
  var median = vals.length ? vals[Math.floor(vals.length / 2)] : null;
  var mean = vals.length ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : null;
  var variance = vals.length ? vals.reduce(function(s, v) { return s + Math.pow(v - mean, 2); }, 0) / vals.length : null;
  var std = variance !== null ? Math.sqrt(variance) : null;
  return {median: median, std: std, n: vals.length};
}

// Гребень вала: максимум в полосе [rimMinFrac, rimMaxFrac] * maxRadius
// по каждому азимуту отдельно, плюс сводная статистика по всем
// азимутам. sensitivityAlt считает то же самое со сдвинутыми на ±20%
// границами -- если результат сильно "плывёт", это предупреждение,
// что окно поиска подобрано неудачно для этого конкретного кратера.
function computeRimStats(pointsInfo, azimuths, maxRadiusM, minFrac, maxFrac) {
  var byAz = {};
  azimuths.forEach(function(az) { byAz[az] = []; });
  pointsInfo.features.forEach(function(f) {
    var az = f.properties.azimuth;
    if (byAz[az]) byAz[az].push({d: f.properties.distance_m, h: f.properties.DEM});
  });

  function rimForBand(minM, maxM) {
    var radii = [], elevs = [], perAz = {};
    azimuths.forEach(function(az) {
      var pts = byAz[az].filter(function(p) { return p.d >= minM && p.d <= maxM && p.h !== null; });
      if (!pts.length) return;
      var best = pts[0];
      pts.forEach(function(p) { if (p.h > best.h) best = p; });
      radii.push(best.d);
      elevs.push(best.h);
      perAz[az] = {rim_radius_m: best.d, rim_elevation_m: best.h};
    });
    var n = radii.length;
    var meanR = radii.reduce(function(a, b) { return a + b; }, 0) / n;
    var meanE = elevs.reduce(function(a, b) { return a + b; }, 0) / n;
    var varR = radii.reduce(function(s, v) { return s + Math.pow(v - meanR, 2); }, 0) / n;
    var stdR = Math.sqrt(varR);
    var medianR = radii.slice().sort(function(a, b) { return a - b; })[Math.floor(n / 2)];
    return {
      meanRadius: meanR, medianRadius: medianR, stdRadius: stdR,
      cvPercent: (stdR / meanR) * 100, meanElev: meanE,
      minRadius: Math.min.apply(null, radii), maxRadius: Math.max.apply(null, radii),
      perAz: perAz, n: n
    };
  }

  var minM = minFrac * maxRadiusM, maxM = maxFrac * maxRadiusM;
  var main = rimForBand(minM, maxM);

  var altMinM = Math.max(0, minFrac * 0.8) * maxRadiusM;
  var altMaxM = Math.min(1, maxFrac * 1.2) * maxRadiusM;
  var alt = rimForBand(altMinM, altMaxM);
  var relDiff = Math.abs(main.meanRadius - alt.meanRadius) / main.meanRadius * 100;
  if (relDiff > 15) {
    state.warnings.push(
        'Результат чувствителен к границам поиска гребня: смещение окна на ±20% меняет ' +
        'средний радиус вала на ' + relDiff.toFixed(1) + '% (' + main.meanRadius.toFixed(0) +
        ' vs ' + alt.meanRadius.toFixed(0) + ' м). Проверьте профиль вручную.');
  }

  return main;
}

// ---------- 8. Зональная статистика ----------
function fullStatsReducer() {
  return ee.Reducer.count()
      .combine({reducer2: ee.Reducer.mean(), sharedInputs: true})
      .combine({reducer2: ee.Reducer.median(), sharedInputs: true})
      .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
      .combine({reducer2: ee.Reducer.minMax(), sharedInputs: true})
      .combine({reducer2: ee.Reducer.percentile([25, 75]), sharedInputs: true});
}

function computeZoneGeometries(center, aoi, rimRadiusM) {
  var b1 = state.zoneFloorFrac * rimRadiusM;
  var b2 = state.zoneRimFrac * rimRadiusM;
  var b3 = state.zoneEjectaFrac * rimRadiusM;
  var err = 1; // м, допуск на упрощение геометрии
  var floorG = center.buffer(b1);
  var rimG = center.buffer(b2).difference(floorG, err);
  var ejectaG = center.buffer(b3).difference(center.buffer(b2), err);
  var plainG = aoi.difference(center.buffer(b3), err);
  return {floor: floorG, rim_slope: rimG, ejecta: ejectaG, plain: plainG};
}

function computeZonalStats(zonesGeom, multibandImage, scaleM) {
  var reducer = fullStatsReducer();
  var out = {};
  Object.keys(zonesGeom).forEach(function(zoneName) {
    var stats = multibandImage.reduceRegion({
      reducer: reducer, geometry: zonesGeom[zoneName], scale: scaleM,
      maxPixels: 1e9, bestEffort: true
    }).getInfo();
    out[zoneName] = stats;
    // грубая проверка на пустую зону (не должна валить всё приложение)
    var anyCount = 0;
    Object.keys(stats).forEach(function(k) {
      if (k.slice(-6) === '_count' && stats[k] > anyCount) anyCount = stats[k];
    });
    if (anyCount === 0) {
      state.warnings.push('Зона "' + zoneName + '" не содержит валидных пикселей -- ' +
          'проверьте границы зон (zoneFloorFrac/zoneRimFrac/zoneEjectaFrac).');
    }
  });
  return out;
}

// ---------- 9. Основная функция перерисовки карты ----------
function update() {
  state.warnings = [];
  try {
    Map.clear();
    Map.setOptions('SATELLITE');
    statusLabel.setValue('Считаю...');

    var center = ee.Geometry.Point([state.lon, state.lat]);
    var aoi = center.buffer(state.sizeKm * 1000).bounds();
    state.aoi = aoi;
    Map.centerObject(aoi, 15);

    // ---- DEM ----
    var dem = pickDem(aoi, state.demMode);
    state.demImage = dem;
    state.demSourceLabel = detectDemSourceLabel(aoi, state.demMode);
    state.demScaleM = 10; // сетка, на которую перепроецирован DEM (см. pickDem*)
    var hillshade = ee.Terrain.hillshade(dem);
    var slope = ee.Terrain.slope(dem);
    state.hillshadeImage = hillshade;
    state.slopeImage = slope;

    var demStats = dem.reduceRegion({
      reducer: ee.Reducer.percentile([2, 98]),
      geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true
    }).getInfo();
    var demMin = demStats['DEM_p2'], demMax = demStats['DEM_p98'];
    state.demMin = demMin;
    state.demMax = demMax;
    var demPalette = ['08306b', '41b6c4', 'ffffcc', 'fd8d3c', 'bd0026'];

    // ---- Sentinel-2 (+ SWIR, индексы) ----
    var s2col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(aoi).filterDate(state.startDate, state.endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
    state.s2SceneCount = s2col.size().getInfo();
    var s2masked = s2col.map(maskS2clouds);
    var s2comp = s2masked.median().clip(aoi).select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']);
    s2comp = addS2Indices(s2comp);
    state.s2Image = s2comp;

    // ---- Sentinel-1 (+ направление орбиты, число сцен) ----
    var s1 = buildS1(aoi, state.s1OrbitMode, state.startDate, state.endDate);
    state.s1Image = s1.image;
    state.s1SceneCount = s1.sceneCount;
    state.s1OrbitsUsed = state.s1OrbitMode;

    // ---- радиальные точки/линии (плоское приближение, см. п.3) ----
    var azimuths = [];
    var stepDeg = 360 / state.nAzimuths;
    for (var a = 0; a < 360; a += stepDeg) azimuths.push(a);

    var lineFC = buildAzimuthLinesFC(state.lon, state.lat, azimuths, state.profileKm);
    var pointsFC = buildAzimuthPointsFC(state.lon, state.lat, azimuths, state.profileKm, state.stepM);

    var sampled = dem.addBands(slope).addBands(hillshade).addBands(s1.image)
        .reduceRegions({collection: pointsFC, reducer: ee.Reducer.first(), scale: state.demScaleM});
    state.sampledPoints = sampled;

    // ---- клиентская статистика (дно, гребень, чувствительность) ----
    var pointsInfo = sampled.getInfo();
    var maxRadiusM = state.profileKm * 1000;
    var floorZoneM = state.floorZoneFrac * maxRadiusM;

    var floorStats = computeFloorStats(pointsInfo, floorZoneM);
    state.floorElevMedian = floorStats.median;
    state.floorElevStd = floorStats.std;

    var rimStats = computeRimStats(pointsInfo, azimuths, maxRadiusM,
        state.rimSearchMinFrac, state.rimSearchMaxFrac);
    state.meanRimRadius = rimStats.meanRadius;
    state.rimRadiusStd = rimStats.stdRadius;
    state.rimRadiusCvPercent = rimStats.cvPercent;
    state.meanRimElev = rimStats.meanElev;
    state.perAzimuth = rimStats.perAz;

    // ---- нормированный профиль (сервер, для экспорта) ----
    var floorE = ee.Number(state.floorElevMedian);
    var rimR = ee.Number(state.meanRimRadius);
    var rimE = ee.Number(state.meanRimElev);
    state.normalizedPoints = sampled.map(function(f) {
      var d = ee.Number(f.get('distance_m'));
      var h = ee.Number(f.get('DEM'));
      return f.set({
        r_norm: d.divide(rimR),
        h_norm: h.subtract(floorE).divide(rimE.subtract(floorE))
      });
    });

    // ---- зональная статистика (использует radius вала из фазы 1) ----
    var zones = computeZoneGeometries(center, aoi, state.meanRimRadius);
    var zonalImage = dem.rename('DEM')
        .addBands(s1.image)
        .addBands(s2comp.select(['B4', 'B8', 'B11', 'B12', 'NDVI', 'NDMI']));
    state.zonalStats = computeZonalStats(zones, zonalImage, state.demScaleM);

    // ---- слои на карте ----
    Map.addLayer(aoi, {color: 'yellow'}, 'Зона интереса (AOI)', false);
    Map.addLayer(s2comp, {bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.30, gamma: 1.1},
        'Sentinel-2 RGB', true);
    Map.addLayer(s2comp, {bands: ['B8', 'B4', 'B3'], min: 0.0, max: 0.4, gamma: 1.1},
        'Sentinel-2 false color (NIR)', false);
    Map.addLayer(s2comp, {bands: ['B12', 'B8', 'B4'], min: 0.0, max: 0.4, gamma: 1.1},
        'Sentinel-2 SWIR-композит', false);
    Map.addLayer(s2comp, {bands: ['NDVI'], min: -0.2, max: 0.6,
      palette: ['8b4513', 'ffffcc', '78c679', '005a32']}, 'NDVI', false);
    Map.addLayer(s2comp, {bands: ['NDMI'], min: -0.5, max: 0.5,
      palette: ['8b4513', 'ffffcc', '2c7fb8']}, 'NDMI', false);
    Map.addLayer(s2comp, {bands: ['B11_B12_ratio'], min: 0.8, max: 1.4,
      palette: ['313695', 'ffffbf', 'a50026']}, 'B11/B12 ratio', false);
    Map.addLayer(dem, {min: demMin, max: demMax, palette: demPalette}, 'Рельеф (DEM)', true);
    Map.addLayer(hillshade, {min: 0, max: 255}, 'Отмывка рельефа (hillshade)', true);
    Map.addLayer(slope, {min: 0, max: 30,
      palette: ['ffffff', 'd9f0a3', 'addd8e', '78c679', '31a354', '006837']}, 'Уклон (slope)', false);
    Map.addLayer(s1.image, {bands: ['VV', 'VH', 'VV_VH_diff'], min: [-20, -25, 0], max: [0, -5, 15]},
        'Sentinel-1 (VV/VH/разность)', false);
    Map.addLayer(zones.floor, {color: '2166ac'}, 'Зона: дно', false);
    Map.addLayer(zones.rim_slope, {color: 'd6604d'}, 'Зона: склон+вал', false);
    Map.addLayer(zones.ejecta, {color: 'f4a582'}, 'Зона: выбросы', false);
    Map.addLayer(zones.plain, {color: '92c5de'}, 'Зона: окружающая равнина', false);
    Map.addLayer(lineFC, {color: '00FFFF'}, 'Радиальные линии профиля', true);
    Map.addLayer(center, {color: 'red'}, 'Центр кратера', true);

    // ---- статус/QA-панель ----
    var warnText = state.warnings.length ?
        ('\n\nПРЕДУПРЕЖДЕНИЯ:\n- ' + state.warnings.join('\n- ')) : '';
    statusLabel.setValue(
        'Кратер: ' + state.name +
        '\nЦентр: ' + state.lon.toFixed(5) + ', ' + state.lat.toFixed(5) +
        '\nDEM: ' + state.demSourceLabel + ' (сетка ' + state.demScaleM + ' м), режим: ' + state.demMode +
        '\nРадиус AOI: ' + state.sizeKm + ' км, профиль: ' + state.profileKm + ' км, азимутов: ' + state.nAzimuths +
        '\nSentinel-2: ' + state.s2SceneCount + ' сцен, ' + state.startDate + ' — ' + state.endDate +
        '\nSentinel-1: ' + state.s1SceneCount + ' сцен, орбита: ' + state.s1OrbitsUsed +
        '\nДно (медиана центр. зоны): ' + fmt(state.floorElevMedian) + ' м (σ=' + fmt(state.floorElevStd) + ')' +
        '\nГребень вала: R=' + fmt(state.meanRimRadius) + ' м (σ=' + fmt(state.rimRadiusStd) +
        ', CV=' + fmt(state.rimRadiusCvPercent) + '%), h=' + fmt(state.meanRimElev) + ' м' +
        warnText
    );

    // навешиваем обработчик клика заново -- Map.clear() выше стирает
    // и его тоже.
    Map.onClick(onMapClick);
  } catch (err) {
    statusLabel.setValue('Ошибка при обновлении: ' + err.message +
        '\n\nПроверьте координаты и параметры, затем нажмите "Обновить карту" ещё раз.');
  }
}

function fmt(x) {
  return (x === null || x === undefined || isNaN(x)) ? 'н/д' : x.toFixed(1);
}

// ---------- 10. График профиля в Code Editor ----------
function showChart() {
  if (!state.sampledPoints) {
    statusLabel.setValue('Сначала нажмите "Обновить карту".');
    return;
  }
  var chart = ui.Chart.feature.groups({
    features: state.sampledPoints,
    xProperty: 'distance_m', yProperty: 'DEM', seriesProperty: 'azimuth'
  }).setOptions({
    title: 'Радиальные профили высот: ' + state.name,
    hAxis: {title: 'Расстояние от центра, м'}, vAxis: {title: 'Высота, м'}
  });
  print(chart);
}

// ---------- 11. Экспорт ----------
function tag() {
  return state.name.replace(/[^a-zA-Z0-9]/g, '_');
}
function yearSpan() {
  return state.startDate.slice(0, 4) + '_' + state.endDate.slice(0, 4);
}
function demSourceTag() {
  return state.demSourceLabel.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
}

function exportProfileCsv() {
  if (!state.sampledPoints) { statusLabel.setValue('Сначала нажмите "Обновить карту".'); return; }
  var withMeta = state.sampledPoints.map(function(f) {
    return f.set({
      crater_name: state.name, dem_source: state.demSourceLabel, dem_scale_m: state.demScaleM,
      center_lon: state.lon, center_lat: state.lat,
      date_start: state.startDate, date_end: state.endDate,
      floor_elevation_m: state.floorElevMedian, rim_elevation_m: state.meanRimElev,
      rim_radius_m: state.meanRimRadius
    });
  });
  var name = tag() + '_profile_raw_' + demSourceTag() + '_' + yearSpan();
  Export.table.toDrive({
    collection: withMeta, description: name, fileNamePrefix: name,
    folder: 'GEE_crater_profiles', fileFormat: 'CSV'
  });
  statusLabel.setValue('Задача поставлена: ' + name + '. Запустите её во вкладке Tasks.');
}

function exportNormalizedCsv() {
  if (!state.normalizedPoints) { statusLabel.setValue('Сначала нажмите "Обновить карту".'); return; }
  var name = tag() + '_profile_normalized_' + yearSpan();
  Export.table.toDrive({
    collection: state.normalizedPoints, description: name, fileNamePrefix: name,
    folder: 'GEE_crater_profiles', fileFormat: 'CSV'
  });
  statusLabel.setValue('Задача поставлена: ' + name + '. Запустите её во вкладке Tasks.');
}

function exportZonalStatsCsv() {
  if (!state.zonalStats) { statusLabel.setValue('Сначала нажмите "Обновить карту".'); return; }
  var feats = [];
  Object.keys(state.zonalStats).forEach(function(zoneName) {
    var row = {crater_name: state.name, zone: zoneName};
    var stats = state.zonalStats[zoneName];
    Object.keys(stats).forEach(function(k) { row[k] = stats[k]; });
    feats.push(ee.Feature(null, row));
  });
  var name = tag() + '_zonal_stats_S1_S2_DEM_' + yearSpan();
  Export.table.toDrive({
    collection: ee.FeatureCollection(feats), description: name, fileNamePrefix: name,
    folder: 'GEE_crater_profiles', fileFormat: 'CSV'
  });
  statusLabel.setValue('Задача поставлена: ' + name + '. Запустите её во вкладке Tasks.');
}

function exportMetadataCsv() {
  var row = {
    crater_name: state.name, center_lon: state.lon, center_lat: state.lat,
    dem_source: state.demSourceLabel, dem_mode: state.demMode, dem_scale_m: state.demScaleM,
    aoi_radius_km: state.sizeKm, profile_km: state.profileKm, n_azimuths: state.nAzimuths,
    step_m: state.stepM, date_start: state.startDate, date_end: state.endDate,
    s2_scene_count: state.s2SceneCount, s1_scene_count: state.s1SceneCount,
    s1_orbit_mode: state.s1OrbitsUsed,
    floor_elevation_m: state.floorElevMedian, floor_elevation_std_m: state.floorElevStd,
    rim_radius_m: state.meanRimRadius, rim_radius_std_m: state.rimRadiusStd,
    rim_radius_cv_percent: state.rimRadiusCvPercent, rim_elevation_m: state.meanRimElev,
    depth_m: state.meanRimElev - state.floorElevMedian,
    warnings: state.warnings.join(' | ')
  };
  var name = tag() + '_metadata_' + yearSpan();
  Export.table.toDrive({
    collection: ee.FeatureCollection([ee.Feature(null, row)]),
    description: name, fileNamePrefix: name, folder: 'GEE_crater_profiles', fileFormat: 'CSV'
  });
  statusLabel.setValue('Задача поставлена: ' + name + '. Запустите её во вкладке Tasks.');
}

function exportImages() {
  if (!state.demImage) { statusLabel.setValue('Сначала нажмите "Обновить карту".'); return; }
  var t = tag(), aoi = state.aoi, ys = yearSpan(), ds = demSourceTag();
  var demPalette = ['08306b', '41b6c4', 'ffffcc', 'fd8d3c', 'bd0026'];

  function exp(image, product) {
    var name = t + '_' + product + '_' + ys;
    Export.image.toDrive({
      image: image, description: name, fileNamePrefix: name,
      folder: 'GEE_crater_profiles', region: aoi, scale: 5, maxPixels: 1e10
    });
  }

  exp(state.s2Image.visualize({bands: ['B4', 'B3', 'B2'], min: 0.02, max: 0.30, gamma: 1.1}), 'S2_RGB');
  exp(state.s2Image.visualize({bands: ['B12', 'B8', 'B4'], min: 0.0, max: 0.4, gamma: 1.1}), 'S2_SWIR');
  exp(state.s2Image.visualize({bands: ['NDVI'], min: -0.2, max: 0.6,
    palette: ['8b4513', 'ffffcc', '78c679', '005a32']}), 'S2_NDVI');
  exp(state.demImage.visualize({min: state.demMin, max: state.demMax, palette: demPalette}), 'DEM_' + ds);
  exp(state.hillshadeImage.visualize({min: 0, max: 255}), 'Hillshade_' + ds);
  exp(state.slopeImage.visualize({min: 0, max: 30,
    palette: ['ffffff', 'd9f0a3', 'addd8e', '78c679', '31a354', '006837']}), 'Slope_' + ds);
  exp(state.s1Image.visualize({bands: ['VV', 'VH', 'VV_VH_diff'], min: [-20, -25, 0], max: [0, -5, 15]}),
      'S1_VVVH_' + state.s1OrbitsUsed);

  statusLabel.setValue('7 задач экспорта картинок поставлено в очередь (' + t + '_*_' + ys +
      '). Откройте вкладку Tasks и запустите каждую.');
}

// ---------- 12. Console-сводка для сравнения кратеров ----------
function printSummaryRow() {
  if (!state.meanRimRadius) { statusLabel.setValue('Сначала нажмите "Обновить карту".'); return; }
  print('=== ' + state.name + ' ===', {
    crater_name: state.name,
    diameter_m: 2 * state.meanRimRadius,
    mean_rim_radius_m: state.meanRimRadius,
    rim_radius_std_m: state.rimRadiusStd,
    rim_radius_cv_percent: state.rimRadiusCvPercent,
    floor_elevation_m: state.floorElevMedian,
    rim_elevation_m: state.meanRimElev,
    depth_m: state.meanRimElev - state.floorElevMedian,
    DEM_source: state.demSourceLabel,
    DEM_scale_m: state.demScaleM,
    S1_scene_count: state.s1SceneCount,
    S2_scene_count: state.s2SceneCount
  });
}

// ---------- 13. Панель управления ----------
var panel = ui.Panel({style: {width: '360px', padding: '8px'}});
panel.add(ui.Label('Мультисенсорный анализ импактных кратеров', {fontWeight: 'bold', fontSize: '16px'}));
panel.add(ui.Label(
    'ДЗЗ-признаки не доказывают ударное происхождение; см. комментарий в начале скрипта.',
    {fontSize: '11px', color: '990000', whiteSpace: 'pre-wrap'}));

var lonBox = ui.Textbox({value: String(state.lon)});
var latBox = ui.Textbox({value: String(state.lat)});

var craterSelect = ui.Select({
  items: Object.keys(CRATERS), value: state.name,
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
panel.add(ui.Label('Долгота:'));
panel.add(lonBox);
panel.add(ui.Label('Широта:'));
panel.add(latBox);

var pickingCenter = false;
var pickCenterBtn = ui.Button({
  label: 'Уточнить центр кликом по карте',
  onClick: function() {
    pickingCenter = true;
    pickCenterBtn.setLabel('Кликните по центру кратера на карте...');
    statusLabel.setValue('Кликните по видимому центру кратера на карте справа.');
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
var profBox = ui.Textbox({value: String(state.profileKm)});
var azBox = ui.Textbox({value: String(state.nAzimuths)});
panel.add(ui.Label('Радиус AOI, км:')); panel.add(sizeBox);
panel.add(ui.Label('Длина профиля, км:')); panel.add(profBox);
panel.add(ui.Label('Число азимутов:')); panel.add(azBox);

panel.add(ui.Label('— DEM —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
var demModeSelect = ui.Select({
  items: [
    {label: 'Единый DEM для сравнения (GLO-30)', value: 'consistent'},
    {label: 'Максимальное доступное разрешение', value: 'best'}
  ],
  value: state.demMode,
  onChange: function(v) { state.demMode = v; }
});
panel.add(demModeSelect);

panel.add(ui.Label('— Гребень вала: окно поиска (доля профиля) —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
var rimMinBox = ui.Textbox({value: String(state.rimSearchMinFrac)});
var rimMaxBox = ui.Textbox({value: String(state.rimSearchMaxFrac)});
panel.add(ui.Label('От:')); panel.add(rimMinBox);
panel.add(ui.Label('До:')); panel.add(rimMaxBox);

panel.add(ui.Label('— Зоны анализа (доли радиуса вала) —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
var zoneFloorBox = ui.Textbox({value: String(state.zoneFloorFrac)});
var zoneRimBox = ui.Textbox({value: String(state.zoneRimFrac)});
var zoneEjectaBox = ui.Textbox({value: String(state.zoneEjectaFrac)});
panel.add(ui.Label('Дно (до):')); panel.add(zoneFloorBox);
panel.add(ui.Label('Вал/склон (до):')); panel.add(zoneRimBox);
panel.add(ui.Label('Выбросы (до):')); panel.add(zoneEjectaBox);

panel.add(ui.Label('— Sentinel-1 —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
var orbitSelect = ui.Select({
  items: ['BOTH', 'ASCENDING', 'DESCENDING'], value: state.s1OrbitMode,
  onChange: function(v) { state.s1OrbitMode = v; }
});
panel.add(orbitSelect);

panel.add(ui.Label('— Даты (Sentinel-1 и Sentinel-2) —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
var startBox = ui.Textbox({value: state.startDate});
var endBox = ui.Textbox({value: state.endDate});
panel.add(ui.Label('С:')); panel.add(startBox);
panel.add(ui.Label('По:')); panel.add(endBox);

var updateBtn = ui.Button({
  label: 'Обновить карту',
  onClick: function() {
    state.name = state.name || 'Пользовательская точка';
    state.lon = parseFloat(lonBox.getValue());
    state.lat = parseFloat(latBox.getValue());
    state.sizeKm = parseFloat(sizeBox.getValue());
    state.profileKm = parseFloat(profBox.getValue());
    state.nAzimuths = parseInt(azBox.getValue(), 10);
    state.rimSearchMinFrac = parseFloat(rimMinBox.getValue());
    state.rimSearchMaxFrac = parseFloat(rimMaxBox.getValue());
    state.zoneFloorFrac = parseFloat(zoneFloorBox.getValue());
    state.zoneRimFrac = parseFloat(zoneRimBox.getValue());
    state.zoneEjectaFrac = parseFloat(zoneEjectaBox.getValue());
    state.startDate = startBox.getValue();
    state.endDate = endBox.getValue();
    update();
  }
});
panel.add(updateBtn);

panel.add(ui.Label('— Графики и экспорт —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
panel.add(ui.Button({label: 'Показать график профиля', onClick: showChart}));
panel.add(ui.Button({label: 'Console-сводка для сравнения', onClick: printSummaryRow}));
panel.add(ui.Button({label: 'Экспорт: профиль (сырой)', onClick: exportProfileCsv}));
panel.add(ui.Button({label: 'Экспорт: профиль (нормированный)', onClick: exportNormalizedCsv}));
panel.add(ui.Button({label: 'Экспорт: зональная статистика', onClick: exportZonalStatsCsv}));
panel.add(ui.Button({label: 'Экспорт: метаданные анализа', onClick: exportMetadataCsv}));
panel.add(ui.Button({label: 'Экспорт: снимки (S2/SWIR/DEM/hillshade/slope/S1)', onClick: exportImages}));

// Простая легенда для палитры DEM (свои чекбоксы слоёв уже даёт сама
// панель слоёв Earth Engine -- отдельные тумблеры видимости не нужны).
function legendRow(color, label) {
  var colorBox = ui.Label('', {backgroundColor: color, padding: '8px', margin: '2px 6px 2px 0'});
  var desc = ui.Label(label, {margin: '2px 0'});
  return ui.Panel([colorBox, desc], ui.Panel.Layout.Flow('horizontal'));
}
panel.add(ui.Label('— Легенда DEM (низкое → высокое) —', {fontWeight: 'bold', margin: '8px 0 0 0'}));
panel.add(legendRow('#08306b', 'самое низкое (дно)'));
panel.add(legendRow('#41b6c4', 'ниже среднего'));
panel.add(legendRow('#ffffcc', 'среднее'));
panel.add(legendRow('#fd8d3c', 'выше среднего'));
panel.add(legendRow('#bd0026', 'самое высокое (гребень)'));

var statusLabel = ui.Label('Нажмите "Обновить карту", чтобы начать.',
    {fontSize: '12px', color: '444444', whiteSpace: 'pre-wrap'});
panel.add(statusLabel);

// ---------- 14. Сборка приложения ----------
ui.root.insert(0, panel);
update();
