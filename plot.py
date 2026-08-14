"""
Красивый нестандартный график: разрез кратера Барринджера (Meteor Crater)
по радиальному профилю высот, экспортированному из Google Earth Engine
(gee_crater_app.js -> кнопка "Экспорт профиля в CSV").

Идея графика (это и есть "нестандартность"): вместо привычного
line-plot("высота от расстояния") строим два взаимодополняющих вида
одного и того же кратера на одном полотне:

  1) Слева — "геологический разрез": 4 полных диаметра кратера
     (пары противоположных азимутов 0-180, 45-225, 90-270, 135-315,
     то есть сразу оба плеча профиля, сшитые в одну линию через центр).
     Каждый разрез нарисован как закрашенный силуэт рельефа и сдвинут
     по вертикали (ridgeline/horizon plot) — так в атласах ударных
     кратеров показывают, что вал приподнят одинаково со всех сторон,
     а чаша при этом остаётся симметричной чашей.
  2) Справа — полярная "визитка" вала: высота и радиус гребня по всем
     8 азимутам сразу, что наглядно показывает круговую симметрию
     (характерный признак ударного, а не эрозионного происхождения).

Нужен файл profile_*.csv в этой же папке (экспорт из Earth Engine).
Установка библиотек: pip install numpy matplotlib pandas
Запуск: python plot.py
"""

import glob

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.collections import LineCollection

# ---------------------------------------------------------------------------
# Настройки
# ---------------------------------------------------------------------------

CRATER_TITLE = "Кратер Барринджер (Meteor Crater), Аризона, США"
OUTPUT_PNG = "crater_profile.png"

RIM_SEARCH_MIN_M = 300   # полоса поиска гребня вала, м от центра
RIM_SEARCH_MAX_M = 900

PALETTE = ["#c1440e", "#e07a5f", "#f2cc8f", "#5b8a72"]  # 4 диаметра
RIDGE_OFFSET = 70  # вертикальный сдвиг между разрезами на левой панели, м

# ---------------------------------------------------------------------------
# Загрузка данных
# ---------------------------------------------------------------------------

csv_matches = sorted(glob.glob("profile_*.csv"))
if not csv_matches:
    raise FileNotFoundError(
        "В этой папке не найден файл profile_*.csv — сначала экспортируйте "
        "профиль из gee_crater_app.js (кнопка «Экспорт профиля в CSV»)."
    )
CSV_PATH = csv_matches[0]

df = pd.read_csv(CSV_PATH)
df = (
    df[["azimuth", "distance_m", "DEM"]]
    .dropna(subset=["DEM"])
    .sort_values(["azimuth", "distance_m"])
)

azimuths = sorted(df["azimuth"].unique())
n_az = len(azimuths)
profiles = {
    az: df[df["azimuth"] == az].set_index("distance_m")["DEM"]
    for az in azimuths
}
max_radius_m = max(s.index.max() for s in profiles.values())

print(f"Файл: {CSV_PATH}")
print(f"Азимутов: {n_az} ({', '.join(str(int(a)) for a in azimuths)})")
print(f"Длина профиля: {max_radius_m:.0f} м")

# ---------------------------------------------------------------------------
# Характеристики кратера
# ---------------------------------------------------------------------------

floor_elev = min(s.iloc[0] for s in profiles.values())  # высота в центре

rim_radius, rim_elev = {}, {}
for az, s in profiles.items():
    band = s[(s.index >= RIM_SEARCH_MIN_M) & (s.index <= RIM_SEARCH_MAX_M)]
    r = band.idxmax()
    rim_radius[az] = r
    rim_elev[az] = band.loc[r]

mean_rim_radius = float(np.mean(list(rim_radius.values())))
mean_rim_elev = float(np.mean(list(rim_elev.values())))
circularity = float(np.std(list(rim_radius.values())) / mean_rim_radius * 100)
depth = mean_rim_elev - floor_elev

print(f"Дно (центр): {floor_elev:.0f} м; средний гребень вала: {mean_rim_elev:.0f} м")
print(f"Глубина вал->дно: {depth:.0f} м; диаметр по гребню: {2 * mean_rim_radius:.0f} м")
print(f"Индекс округлости (разброс радиуса гребня): {circularity:.1f}%")

# ---------------------------------------------------------------------------
# Пары противоположных азимутов -> полные диаметры через центр
# ---------------------------------------------------------------------------

pairs, seen = [], set()
for az in azimuths:
    opp = (az + 180) % 360
    if az in seen:
        continue
    if opp in profiles and opp != az:
        pairs.append((az, opp))
        seen.update([az, opp])
    else:
        pairs.append((az, None))
        seen.add(az)


def diameter_xy(az, opp):
    s_pos = profiles[az]
    if opp is None:
        x = s_pos.index.values.astype(float)
        y = s_pos.values.astype(float)
        return x, y
    s_neg = profiles[opp]
    x = np.concatenate([-s_neg.index.values[::-1], s_pos.index.values[1:]]).astype(float)
    y = np.concatenate([s_neg.values[::-1], s_pos.values[1:]]).astype(float)
    return x, y


# ---------------------------------------------------------------------------
# Построение графика
# ---------------------------------------------------------------------------

plt.rcParams["font.family"] = "DejaVu Sans"
BG = "#0b0d13"
FG = "#e8e6df"

fig = plt.figure(figsize=(21, 8.5), facecolor=BG)
gs = fig.add_gridspec(1, 3, width_ratios=[1.35, 1.85, 1.1], wspace=0.38)
ax_ridge = fig.add_subplot(gs[0, 0])
ax = fig.add_subplot(gs[0, 1])
ax_polar = fig.add_subplot(gs[0, 2], projection="polar")

ax_ridge.set_facecolor(BG)
ax.set_facecolor(BG)
fig.patch.set_facecolor(BG)

# --- левая панель: разрезы по 4 диаметрам со сдвигом по вертикали (по азимутам) ---
n_pairs = len(pairs)
for i, (az, opp) in enumerate(pairs):
    x, y = diameter_xy(az, opp)
    base = (n_pairs - 1 - i) * RIDGE_OFFSET
    y_rel = (y - floor_elev) * 0.6 + base  # лёгкое вертикальное сжатие для читаемости
    color = PALETTE[i % len(PALETTE)]

    ax_ridge.fill_between(x, base, y_rel, color=color, alpha=0.75, lw=0, zorder=n_pairs - i)
    ax_ridge.plot(x, y_rel, color=FG, lw=1.3, alpha=0.9, zorder=n_pairs - i + 0.5)
    ax_ridge.axhline(base, color=FG, lw=0.4, alpha=0.25, zorder=0)

    label = f"{int(az)}°–{int(opp) if opp is not None else int(az) + 180}°"
    ax_ridge.text(-max_radius_m * 1.04, base, label, color=color, fontsize=10,
                  ha="right", va="center", fontweight="bold")

ax_ridge.axvline(0, color=FG, lw=0.8, alpha=0.4, ls=":")
ax_ridge.text(0, (n_pairs - 1) * RIDGE_OFFSET + (mean_rim_elev - floor_elev) * 0.6 + 18,
              "центр кратера", color=FG, fontsize=9, ha="center", alpha=0.7)

ax_ridge.set_xlim(-max_radius_m * 1.18, max_radius_m * 1.05)
ax_ridge.set_xlabel("Расстояние от центра, м", color=FG, fontsize=10)
ax_ridge.set_yticks([])
for spine in ax_ridge.spines.values():
    spine.set_visible(False)
ax_ridge.tick_params(colors=FG)
ax_ridge.set_title("Разрезы по азимутам\n(условный сдвиг по вертикали)",
                    color=FG, fontsize=12, pad=14)

# --- средняя панель: разрезы по 4 диаметрам на общей явной шкале высот ---
n_pairs = len(pairs)
for i, (az, opp) in enumerate(pairs):
    x, y = diameter_xy(az, opp)
    color = PALETTE[i % len(PALETTE)]
    label = f"{int(az)}°–{int(opp) if opp is not None else int(az) + 180}°"

    ax.fill_between(x, floor_elev, y, color=color, alpha=0.22, lw=0, zorder=i)
    ax.plot(x, y, color=color, lw=2.2, alpha=0.95, zorder=i + 0.5, label=label)

ax.axvline(0, color=FG, lw=0.8, alpha=0.4, ls=":")
ax.axhline(floor_elev, color=FG, lw=1, alpha=0.5, ls="--")
ax.axhline(mean_rim_elev, color=FG, lw=1, alpha=0.5, ls="--")
ax.text(max_radius_m * 1.02, floor_elev, f"дно ≈ {floor_elev:.0f} м",
        color=FG, fontsize=9.5, va="center", alpha=0.85)
ax.text(max_radius_m * 1.02, mean_rim_elev, f"средний гребень ≈ {mean_rim_elev:.0f} м",
        color=FG, fontsize=9.5, va="center", alpha=0.85)

ax.set_xlim(-max_radius_m * 1.05, max_radius_m * 1.32)
ax.set_xlabel("Расстояние от центра, м  (по парам противоположных азимутов)",
              color=FG, fontsize=10)
ax.set_ylabel("Высота, м над уровнем моря", color=FG, fontsize=10)
ax.grid(axis="y", color=FG, alpha=0.15, lw=0.6)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.tick_params(colors=FG)
ax.set_title("Разрезы через центр по 4 диаметрам",
             color=FG, fontsize=12, pad=14)
legend = ax.legend(loc="upper left", frameon=False, fontsize=9.5, labelcolor=FG,
                    title="Азимуты (пара)", ncol=1)
legend.get_title().set_color(FG)

# --- правая панель: полярная форма вала ---
ax_polar.set_facecolor(BG)
theta = np.radians(azimuths)
theta_c = np.append(theta, theta[0])
r_c = np.append([rim_radius[a] for a in azimuths], rim_radius[azimuths[0]])
elev_c = np.array([rim_elev[a] for a in azimuths] + [rim_elev[azimuths[0]]])

ax_polar.plot(theta_c, r_c, color=FG, lw=1.2, alpha=0.7)
ax_polar.fill(theta_c, r_c, color="#c1440e", alpha=0.15)
sc = ax_polar.scatter(theta, [rim_radius[a] for a in azimuths],
                       c=[rim_elev[a] for a in azimuths], cmap="inferno",
                       s=160, edgecolor=BG, linewidth=1.5, zorder=5)

ax_polar.set_theta_zero_location("N")
ax_polar.set_theta_direction(-1)
ax_polar.set_facecolor(BG)
ax_polar.tick_params(colors=FG)
ax_polar.grid(color=FG, alpha=0.2)
ax_polar.spines["polar"].set_color(FG)
ax_polar.set_title(
    f"Форма гребня вала (вид сверху)\nдиаметр ≈ {2 * mean_rim_radius:.0f} м · "
    f"округлость {circularity:.1f}%",
    color=FG, fontsize=12, pad=20,
)

cb = fig.colorbar(sc, ax=ax_polar, pad=0.14, shrink=0.65)
cb.set_label("Высота гребня, м", color=FG)
cb.ax.yaxis.set_tick_params(color=FG)
plt.setp(plt.getp(cb.ax.axes, "yticklabels"), color=FG)

# --- общий заголовок и подпись с характеристиками ---
fig.subplots_adjust(left=0.08, right=0.95, top=0.78, bottom=0.1)

fig.suptitle(CRATER_TITLE, color=FG, fontsize=17, fontweight="bold", y=0.97)
fig.text(
    0.5, 0.895,
    f"DEM (Google Earth Engine) · глубина вал→дно ≈ {depth:.0f} м · "
    f"средняя высота гребня {mean_rim_elev:.0f} м над у.м.",
    color=FG, fontsize=10.5, ha="center", alpha=0.85,
)
plt.savefig(OUTPUT_PNG, dpi=200, facecolor=BG)
print(f"Сохранено: {OUTPUT_PNG}")
plt.show()
