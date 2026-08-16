"""
Компактная версия графика профиля (2 панели: разрез с явной осью высот +
полярная форма вала) для каждого кратера отдельно -- для слайдов
презентации, где нужен единообразный вид по всем трём кратерам.

Обновлено под новый формат экспорта gee_crater_app.js:
  <Кратер>_profile_raw_<DEM-источник>_<годы>.csv
Итоговые числа (дно/гребень/глубина/CV) берутся из <Кратер>_metadata_*.csv
-- это тот же устойчивый расчёт (медиана центральной зоны, окно поиска
с проверкой чувствительности), что и в самом GEE-приложении, вместо
повторного пересчёта в Python попроще.

Запуск: python case_study_chart.py
"""

import glob

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

PALETTE = ["#c1440e", "#e07a5f", "#f2cc8f", "#5b8a72", "#8a6bb0", "#4f8fa3", "#b0556b", "#7a9e4f"]
BG = "#10203c"
FG = "#e8e6df"
plt.rcParams["font.family"] = "DejaVu Sans"


def diameter_xy(profiles, az, opp):
    s_pos = profiles[az]
    if opp is None:
        return s_pos.index.values.astype(float), s_pos.values.astype(float)
    s_neg = profiles[opp]
    x = np.concatenate([-s_neg.index.values[::-1], s_pos.index.values[1:]]).astype(float)
    y = np.concatenate([s_neg.values[::-1], s_pos.values[1:]]).astype(float)
    return x, y


def find_csv(*patterns):
    for pat in patterns:
        matches = sorted(glob.glob(pat))
        if matches:
            return matches[0]
    return None


def build_chart(profile_csv, meta_csv, title, output_png):
    df = pd.read_csv(profile_csv)
    df = (
        df[["azimuth", "distance_m", "DEM"]]
        .dropna(subset=["DEM"])
        .sort_values(["azimuth", "distance_m"])
    )
    azimuths = sorted(df["azimuth"].unique())
    profiles = {az: df[df["azimuth"] == az].set_index("distance_m")["DEM"] for az in azimuths}
    max_radius_m = max(s.index.max() for s in profiles.values())

    meta = pd.read_csv(meta_csv).iloc[0]
    floor_elev = float(meta["floor_elevation_m"])
    mean_rim_elev = float(meta["rim_elevation_m"])
    mean_rim_radius = float(meta["rim_radius_m"])
    rim_radius_cv_percent = float(meta["rim_radius_cv_percent"])
    depth = mean_rim_elev - floor_elev
    dem_source = str(meta["dem_source"])

    # для положения точек на полярной панели -- локальный поиск пика
    # в окне вокруг общего радиуса вала (только для отображения формы,
    # итоговые числа уже взяты из метаданных выше)
    rim_min_m, rim_max_m = 0.5 * mean_rim_radius, 1.5 * mean_rim_radius
    rim_radius, rim_elev = {}, {}
    for az, s in profiles.items():
        band = s[(s.index >= rim_min_m) & (s.index <= rim_max_m)]
        if band.empty:
            band = s
        r = band.idxmax()
        rim_radius[az] = r
        rim_elev[az] = band.loc[r]

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

    fig = plt.figure(figsize=(13, 6.2), facecolor=BG)
    gs = fig.add_gridspec(1, 2, width_ratios=[1.75, 1], wspace=0.32)
    ax = fig.add_subplot(gs[0, 0])
    ax_polar = fig.add_subplot(gs[0, 1], projection="polar")
    ax.set_facecolor(BG)

    for i, (az, opp) in enumerate(pairs):
        x, y = diameter_xy(profiles, az, opp)
        color = PALETTE[i % len(PALETTE)]
        label = f"{int(az)}°–{int(opp) if opp is not None else int(az) + 180}°"
        ax.fill_between(x, floor_elev, y, color=color, alpha=0.18, lw=0, zorder=i)
        ax.plot(x, y, color=color, lw=1.8, alpha=0.95, zorder=i + 0.5, label=label)

    ax.axvline(0, color=FG, lw=0.8, alpha=0.4, ls=":")
    ax.axhline(floor_elev, color=FG, lw=1, alpha=0.5, ls="--")
    ax.axhline(mean_rim_elev, color=FG, lw=1, alpha=0.5, ls="--")
    ax.text(max_radius_m * 1.02, floor_elev, f"дно ≈ {floor_elev:.0f} м",
            color=FG, fontsize=9, va="center", alpha=0.85)
    ax.text(max_radius_m * 1.02, mean_rim_elev, f"гребень ≈ {mean_rim_elev:.0f} м",
            color=FG, fontsize=9, va="center", alpha=0.85)
    ax.set_xlim(-max_radius_m * 1.05, max_radius_m * 1.35)
    ax.set_xlabel("Расстояние от центра, м", color=FG, fontsize=10)
    ax.set_ylabel("Высота, м над уровнем моря", color=FG, fontsize=10)
    ax.grid(axis="y", color=FG, alpha=0.15, lw=0.6)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(colors=FG)
    legend = ax.legend(loc="upper left", frameon=True, facecolor=BG, framealpha=0.75,
                        edgecolor="none", fontsize=7.5, labelcolor=FG,
                        title="Азимуты", ncol=1)
    legend.get_title().set_color(FG)

    ax_polar.set_facecolor(BG)
    theta = np.radians(azimuths)
    theta_c = np.append(theta, theta[0])
    r_c = np.append([rim_radius[a] for a in azimuths], rim_radius[azimuths[0]])
    ax_polar.plot(theta_c, r_c, color=FG, lw=1.2, alpha=0.7)
    ax_polar.fill(theta_c, r_c, color="#c1440e", alpha=0.15)
    sc = ax_polar.scatter(theta, [rim_radius[a] for a in azimuths],
                           c=[rim_elev[a] for a in azimuths], cmap="inferno",
                           s=100, edgecolor=BG, linewidth=1.2, zorder=5)
    ax_polar.set_theta_zero_location("N")
    ax_polar.set_theta_direction(-1)
    ax_polar.tick_params(colors=FG, labelsize=8)
    ax_polar.grid(color=FG, alpha=0.2)
    ax_polar.spines["polar"].set_color(FG)
    ax_polar.set_title(f"D ≈ {2*mean_rim_radius:.0f} м · неоднородность радиуса {rim_radius_cv_percent:.1f}%",
                        color=FG, fontsize=10.5, pad=16)

    fig.suptitle(title, color=FG, fontsize=15, fontweight="bold", y=1.01)
    fig.text(0.5, 0.965, f"DEM: {dem_source}", color=FG, fontsize=9.5, alpha=0.7, ha="center")
    plt.tight_layout()
    plt.savefig(output_png, dpi=200, facecolor=BG, bbox_inches="tight")
    plt.close(fig)
    print(f"{output_png}: D={2*mean_rim_radius:.0f} м, depth={depth:.0f} м, "
          f"floor={floor_elev:.0f} м, rim={mean_rim_elev:.0f} м, rim_cv={rim_radius_cv_percent:.1f}%, "
          f"DEM={dem_source}")


JOBS = [
    ("Barringer", "*Barringer*profile_raw*.csv", "*Barringer*metadata*.csv",
     "Барринджер (Meteor Crater)", "case_Barringer.png"),
    ("Lonar", "*Lonar*profile_raw*.csv", "*Lonar*metadata*.csv", "Lonar", "case_Lonar.png"),
    ("Wolfe Creek", "*Wolfe_Creek*profile_raw*.csv", "*Wolfe_Creek*metadata*.csv",
     "Wolfe Creek", "case_WolfeCreek.png"),
]

for name, profile_pattern, meta_pattern, title, out in JOBS:
    profile_csv = find_csv(profile_pattern, f"profile_{name.replace(' ', '_')}*.csv")
    meta_csv = find_csv(meta_pattern)
    if profile_csv and meta_csv:
        build_chart(profile_csv, meta_csv, title, out)
    else:
        print(f"[пропуск] {name}: profile={profile_csv}, metadata={meta_csv}")
