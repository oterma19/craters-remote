"""
Сравнение измеренных нами параметров кратеров (по CSV-профилям из
gee_crater_app.js) с опубликованными геологическими данными и с
классической эмпирической зависимостью глубина/диаметр для свежих
простых кратеров (Pike, 1977; Grieve, 1987): d/D ~ 0.15-0.20.

Что показывает график:
  - опубликованные (D, depth) для каждого кратера -- ромб;
  - наши измерения по DEM-профилю -- кружок, соединён пунктиром с
    опубликованной точкой (видно, насколько метод согласуется с
    литературой -- у Барринджера должно совпасть почти точно);
  - заштрихованная полоса d/D=0.15-0.20 -- эталон "свежего" кратера;
  - подписи возраста и породы-мишени поясняют отклонения от полосы.

Запуск: python compare_craters.py
"""

import glob

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

def measure_crater(meta_csv_path):
    """Читает готовые (устойчиво посчитанные в GEE) параметры кратера из
    metadata_*.csv -- медиана центральной зоны для дна, окно поиска с
    проверкой чувствительности для гребня. Не пересчитываем заново в
    Python, чтобы не разойтись с остальными графиками/приложением."""
    meta = pd.read_csv(meta_csv_path).iloc[0]
    mean_rim_radius = float(meta["rim_radius_m"])
    floor_elev = float(meta["floor_elevation_m"])
    mean_rim_elev = float(meta["rim_elevation_m"])
    return {
        "diameter_m": 2 * mean_rim_radius,
        "depth_m": mean_rim_elev - floor_elev,
        "floor_elev_m": floor_elev,
        "rim_elev_m": mean_rim_elev,
        "rim_radius_cv_percent": float(meta["rim_radius_cv_percent"]),
        "dem_source": str(meta["dem_source"]),
    }


# ---------------------------------------------------------------------------
# Опубликованные данные (см. источники в тексте доклада)
# ---------------------------------------------------------------------------

CRATERS = {
    "Барринджер\n(Meteor Crater)": {
        "meta_pattern": "*Barringer*metadata*.csv",
        "published_diameter_m": 1200,
        "published_depth_m": 170,
        "age": "50 тыс. лет",
        "target": "осадочные породы",
        "color": "#c1440e",
    },
    "Lonar": {
        "meta_pattern": "*Lonar*metadata*.csv",
        "published_diameter_m": 1830,
        "published_depth_m": 137,  # среднее по диапазону 120-150 м из литературы
        "age": "~570 / ~37.5 тыс. лет*",
        "target": "базальт",
        "color": "#5b8a72",
    },
    "Wolfe Creek": {
        "meta_pattern": "*Wolfe_Creek*metadata*.csv",
        "published_diameter_m": 892,
        "published_depth_m": 178,  # исходная глубина ДО заполнения осадками
        "age": "120 тыс. лет",
        "target": "песчаник",
        "color": "#e0a458",
    },
}

# ---------------------------------------------------------------------------
# Измерения по нашим CSV
# ---------------------------------------------------------------------------

results = {}
for name, info in CRATERS.items():
    matches = glob.glob(info["meta_pattern"])
    if not matches:
        print(f"[пропуск] нет файла {info['meta_pattern']} для «{name}»")
        continue
    m = measure_crater(matches[0])
    results[name] = m
    print(
        f"{name.splitlines()[0]:22s} наши: D={m['diameter_m']:.0f} м, "
        f"depth={m['depth_m']:.0f} м, d/D={m['depth_m']/m['diameter_m']:.3f}  |  "
        f"публикация: D={info['published_diameter_m']} м, depth={info['published_depth_m']} м, "
        f"d/D={info['published_depth_m']/info['published_diameter_m']:.3f}"
    )

# ---------------------------------------------------------------------------
# График
# ---------------------------------------------------------------------------

BG = "#10203c"
FG = "#e8e6df"
plt.rcParams["font.family"] = "DejaVu Sans"

fig, ax = plt.subplots(figsize=(11, 8.5), facecolor=BG)
ax.set_facecolor(BG)

d_range = np.array([70, 3000])
ax.fill_between(d_range, 0.15 * d_range, 0.20 * d_range,
                 color=FG, alpha=0.12, zorder=0,
                 label="эталон свежих простых кратеров\n(d/D = 0.15-0.20, Pike 1977 / Grieve 1987)")
ax.plot(d_range, 0.175 * d_range, color=FG, lw=1, ls="--", alpha=0.5, zorder=0)

# Kaali -- только опубликованные данные (слишком мал для разрешения DEM 30 м)
ax.scatter([110], [22], marker="D", s=140, color="#9b6bd6", edgecolor=BG,
           linewidth=1.2, zorder=4, label="Kaali (только публикация, DEM 30 м не разрешает)")
ax.annotate("Kaali\n~3200 лет, доломит", (110, 22), textcoords="offset points",
            xytext=(10, -22), color="#9b6bd6", fontsize=9, ha="left")

for name, info in CRATERS.items():
    color = info["color"]
    pub_d, pub_h = info["published_diameter_m"], info["published_depth_m"]
    ax.scatter([pub_d], [pub_h], marker="D", s=160, color=color, edgecolor=BG,
               linewidth=1.2, zorder=4)

    if name in results:
        m = results[name]
        our_d, our_h = m["diameter_m"], m["depth_m"]
        ax.plot([pub_d, our_d], [pub_h, our_h], color=color, lw=1.2, ls=":", alpha=0.8, zorder=3)
        ax.scatter([our_d], [our_h], marker="o", s=160, facecolor=BG, edgecolor=color,
                   linewidth=2.2, zorder=5)
        label_x, label_y = our_d, our_h
    else:
        label_x, label_y = pub_d, pub_h

    short = name.splitlines()[0]
    ax.annotate(f"{short}\n{info['age']}, {info['target']}",
                (label_x, label_y), textcoords="offset points", xytext=(12, 10),
                color=color, fontsize=9.5, ha="left", fontweight="bold")

ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlim(70, 3000)
ax.set_ylim(10, 400)
ax.set_xlabel("Диаметр по гребню вала, м (лог. шкала)", color=FG, fontsize=11)
ax.set_ylabel("Глубина вал→дно, м (лог. шкала)", color=FG, fontsize=11)
ax.set_title(
    "Глубина/диаметр кратеров: наши измерения (○) vs публикации (◇)\n"
    "относительно эталона свежих простых кратеров",
    color=FG, fontsize=13.5, pad=14,
)

ax.tick_params(colors=FG, which="both")
for spine in ax.spines.values():
    spine.set_color(FG)
    spine.set_alpha(0.3)
ax.grid(True, which="both", color=FG, alpha=0.12, lw=0.5)

# лёгенда маркеров формы (не путать с цветовой -- цвет уже подписан текстом у точек)
from matplotlib.lines import Line2D
shape_legend = [
    Line2D([0], [0], marker="D", color="none", markerfacecolor=FG, markeredgecolor=BG,
           markersize=10, label="опубликованные данные"),
    Line2D([0], [0], marker="o", color="none", markerfacecolor=BG, markeredgecolor=FG,
           markeredgewidth=2, markersize=10, label="наше измерение (DEM-профиль)"),
]
leg1 = ax.legend(handles=shape_legend, loc="upper left", frameon=False,
                  fontsize=9.5, labelcolor=FG)
ax.add_artist(leg1)
band_patch = plt.Rectangle((0, 0), 1, 1, fc=FG, alpha=0.12)
ax.legend(handles=[band_patch], labels=["эталон свежих простых кратеров\nd/D = 0.15-0.20"],
          loc="lower right", frameon=False, fontsize=9.5, labelcolor=FG)

fig.text(0.5, 0.015,
         "* для Lonar в литературе два конфликтующих датирования (Ar-Ar даёт ~570 тыс. лет, "
         "космогенные нуклиды -- ~37.5 тыс. лет)",
         color=FG, fontsize=8.5, ha="center", alpha=0.6)

plt.tight_layout(rect=(0, 0.03, 1, 1))
plt.savefig("crater_geology_comparison.png", dpi=200, facecolor=BG)
print("Сохранено: crater_geology_comparison.png")
plt.show()
