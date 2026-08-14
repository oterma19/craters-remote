# Дистанционное зондирование земных кратеров

Морфометрический анализ ударных кратеров (Barringer / Meteor Crater, Lonar, Wolfe Creek)
по данным Google Earth Engine: цифровая модель рельефа (SRTM / Copernicus GLO-30 / USGS 3DEP),
Sentinel-2 (оптика) и Sentinel-1 (радар).

## Главный результат (ДЗ, Задание №1)

![Радиальные профили кратера Барринджера](crater_profile.png)

Радиальные профили высот по 8 азимутам + полярная форма вала — построено скриптом
[`plot.py`](plot.py) по CSV-профилю, экспортированному из Earth Engine.

## Как это работает

1. **[`gee_crater_app.js`](gee_crater_app.js)** — интерактивный скрипт для Google Earth Engine
   Code Editor (https://code.earthengine.google.com/). Показывает кратер на карте (Sentinel-2,
   DEM, hillshade, slope, Sentinel-1), считает радиальные профили высоты по N азимутам и
   экспортирует их в CSV + снимки слоёв — в Google Drive.
2. Скачанный `profile_*.csv` кладётся в эту папку.
3. Python-скрипты строят графики:
   - **[`plot.py`](plot.py)** — главный график: 3 панели (разрезы по азимутам со сдвигом,
     разрезы на явной шкале высот, полярная форма вала) для одного кратера.
   - **[`case_study_chart.py`](case_study_chart.py)** — компактная 2-панельная версия, по одной
     на каждый кратер (`case_Barringer.png`, `case_Lonar.png`, `case_WolfeCreek.png`).
   - **[`compare_craters.py`](compare_craters.py)** — сравнение измеренных диаметра/глубины
     с опубликованными геологическими данными и эталонной зависимостью depth/diameter для
     свежих простых кратеров (Pike 1977, Grieve 1987) → `crater_geology_comparison.png`.
   - **[`radar_backscatter_chart.py`](radar_backscatter_chart.py)** — сравнение радарного
     отклика (Sentinel-1 VV) вала и дна кратера → `radar_backscatter.png`.
   - **[`build_presentation.py`](build_presentation.py)** — собирает итоговую презентацию
     `crater_presentation.pptx` из всех графиков и снимков.

## Установка

```bash
pip install numpy matplotlib pandas python-pptx pillow
```

## Данные

`profile_*.csv` — радиальные профили (азимут, расстояние от центра, высота DEM, VV/VH
Sentinel-1, slope, hillshade), экспортированные из `gee_crater_app.js`.

## Результаты

| Кратер | Диаметр (наше / публ.) | Глубина (наше / публ.) |
|---|---|---|
| Барринджер | 1200 м / 1200 м | 162 м / 170 м |
| Lonar | 1785 м / 1830 м | 100 м / ~137 м |
| Wolfe Creek | 900 м / 892 м | 45 м / 178 м* |

\* исходная глубина по публикации, до заполнения кратера песком.
