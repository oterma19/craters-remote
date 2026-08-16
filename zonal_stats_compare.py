"""
Сравнение зональной статистики (дно / склон+вал / выбросы / равнина)
по DEM, Sentinel-1 (VV, VH) и Sentinel-2 (NDVI, NDMI) между кратерами
-- новый уровень анализа по сравнению с простым "вал vs дно" из
radar_backscatter_chart.py: здесь 4 зоны и сразу оптика+радар вместе.

Источник: <Кратер>_zonal_stats_S1_S2_DEM_<годы>.csv (кнопка "Экспорт:
зональная статистика" в gee_crater_app.js).

Запуск: python zonal_stats_compare.py
"""

import glob

import matplotlib.pyplot as plt
import pandas as pd

BG = "#10203c"
FG = "#e8e6df"
plt.rcParams["font.family"] = "DejaVu Sans"

ZONE_ORDER = ["floor", "rim_slope", "ejecta", "plain"]
ZONE_LABELS = {"floor": "дно", "rim_slope": "склон+вал", "ejecta": "выбросы", "plain": "равнина"}

CRATERS = {
    "Барринджер": ("*Barringer*zonal_stats*.csv", "#c1440e"),
    "Lonar": ("*Lonar*zonal_stats*.csv", "#5b8a72"),
    "Wolfe Creek": ("*Wolfe_Creek*zonal_stats*.csv", "#e0a458"),
}

METRICS = [
    ("VV_mean", "VV, дБ (радар, среднее)"),
    ("VH_mean", "VH, дБ (радар, среднее)"),
    ("NDVI_mean", "NDVI (растительность, среднее)"),
    ("NDMI_mean", "NDMI (влажность поверхности, среднее)"),
]

frames = {}
missing = []
for name, (pattern, color) in CRATERS.items():
    matches = sorted(glob.glob(pattern))
    if not matches:
        missing.append(name)
        continue
    df = pd.read_csv(matches[0]).set_index("zone").reindex(ZONE_ORDER)
    frames[name] = (df, color)

if missing:
    print(f"[пропуск] нет zonal_stats для: {', '.join(missing)} -- "
          f"экспортируйте кнопкой «Экспорт: зональная статистика» и досчитаем позже.")
if not frames:
    raise SystemExit("Нет ни одного файла zonal_stats_*.csv -- нечего строить.")

fig, axes = plt.subplots(2, 2, figsize=(13, 9.5), facecolor=BG)
axes = axes.ravel()
x = range(len(ZONE_ORDER))

for ax, (col, title) in zip(axes, METRICS):
    ax.set_facecolor(BG)
    for name, (df, color) in frames.items():
        if col not in df.columns:
            continue
        ax.plot(x, df[col].values, marker="o", ms=7, lw=2.2, color=color, label=name)
    ax.set_xticks(list(x))
    ax.set_xticklabels([ZONE_LABELS[z] for z in ZONE_ORDER], color=FG, fontsize=10)
    ax.set_title(title, color=FG, fontsize=12, pad=10)
    ax.tick_params(colors=FG)
    for spine in ax.spines.values():
        spine.set_color(FG)
        spine.set_alpha(0.3)
    ax.grid(axis="y", color=FG, alpha=0.15, lw=0.5)

axes[0].legend(frameon=False, fontsize=9.5, labelcolor=FG, loc="best")

fig.suptitle("Зональная статистика: дно → склон+вал → выбросы → равнина",
             color=FG, fontsize=15, fontweight="bold", y=0.99)
note = "Барринджер: зональная статистика ещё не экспортирована -- на графике только Lonar/Wolfe Creek." \
    if missing else "Все три кратера."
fig.text(0.5, 0.955, note, color=FG, fontsize=10, ha="center", alpha=0.7)

plt.tight_layout(rect=(0, 0, 1, 0.94))
plt.savefig("zonal_stats_compare.png", dpi=200, facecolor=BG)
print("Сохранено: zonal_stats_compare.png")

# ---------------------------------------------------------------------------
# Числовая сводка в консоль -- для выводов
# ---------------------------------------------------------------------------
print()
for name, (df, _) in frames.items():
    print(f"=== {name} ===")
    for col, title in METRICS:
        if col in df.columns:
            vals = " -> ".join(f"{ZONE_LABELS[z]}={df.loc[z, col]:.2f}" for z in ZONE_ORDER)
            print(f"  {title}: {vals}")
