# -*- coding: utf-8 -*-
"""
Сравнение НОРМИРОВАННЫХ радиальных профилей нескольких кратеров на
одном графике -- позволяет сравнивать форму кратера независимо от
абсолютного масштаба (диаметра).

r_norm = distance_m / mean_rim_radius
h_norm = (DEM - floor_elev) / (rim_elev - floor_elev)

Оба столбца считаются на сервере в обновлённом gee_crater_app.js и
экспортируются кнопкой «Экспорт: профиль (нормированный)» в файлы вида
<Кратер>_profile_normalized_<год>_<год>.csv

Если у вас ещё нет таких файлов (только старые profile_*.csv без
r_norm/h_norm) -- этот скрипт посчитает нормировку сам по столбцам
distance_m/DEM, используя ту же логику (медиана центральной зоны как
дно, максимум в полосе 20-60% как гребень), чтобы график можно было
построить и на старых экспортах. В этом случае в подписи графика будет
явная пометка "нормировано локально в Python", чтобы не путать с
значениями, посчitанными в самом GEE-приложении.

Запуск: python normalized_profile_compare.py
"""

import glob
import re

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

BG = "#10203c"
FG = "#e8e6df"
PALETTE = {"Barringer": "#c1440e", "Lonar": "#5b8a72", "Wolfe_Creek": "#e0a458"}
plt.rcParams["font.family"] = "DejaVu Sans"


def local_normalize(df, rim_min_frac=0.2, rim_max_frac=0.6, floor_frac=0.1):
    """Резервный расчёт r_norm/h_norm, если в CSV их ещё нет (старый экспорт)."""
    max_r = df["distance_m"].max()
    floor_zone = df[df["distance_m"] <= floor_frac * max_r]
    floor_elev = floor_zone["DEM"].median()

    rim_band = df[(df["distance_m"] >= rim_min_frac * max_r) & (df["distance_m"] <= rim_max_frac * max_r)]
    rim_radii = rim_band.groupby("azimuth").apply(lambda g: g.loc[g["DEM"].idxmax(), "distance_m"])
    rim_elevs = rim_band.groupby("azimuth").apply(lambda g: g["DEM"].max())
    mean_rim_radius = rim_radii.mean()
    mean_rim_elev = rim_elevs.mean()

    df = df.copy()
    df["r_norm"] = df["distance_m"] / mean_rim_radius
    df["h_norm"] = (df["DEM"] - floor_elev) / (mean_rim_elev - floor_elev)
    return df


def load_normalized(csv_path):
    df = pd.read_csv(csv_path)
    if "r_norm" in df.columns and "h_norm" in df.columns:
        return df, False
    if "DEM" not in df.columns or "distance_m" not in df.columns:
        raise ValueError(f"{csv_path}: нет ни r_norm/h_norm, ни DEM/distance_m -- не тот файл")
    return local_normalize(df), True


# ---------------------------------------------------------------------------
# Ищем файлы: сперва новый формат (*_profile_normalized_*.csv), затем
# старый (profile_*.csv) как запасной вариант.
# ---------------------------------------------------------------------------

CRATERS = {
    "Барринджер": (["*Barringer*profile_normalized*.csv", "profile_Barringer*.csv"], "#c1440e"),
    "Lonar": (["*Lonar*profile_normalized*.csv", "profile_Lonar*.csv"], "#5b8a72"),
    "Wolfe Creek": (["*Wolfe_Creek*profile_normalized*.csv", "profile_Wolfe_Creek*.csv"], "#e0a458"),
}

fig, ax = plt.subplots(figsize=(10, 7.5), facecolor=BG)
ax.set_facecolor(BG)

any_local = False
plotted = 0
for name, (patterns, color) in CRATERS.items():
    csv_path = None
    for pat in patterns:
        matches = sorted(glob.glob(pat))
        if matches:
            csv_path = matches[0]
            break
    if csv_path is None:
        print(f"[пропуск] нет файла для «{name}» (искали: {patterns})")
        continue

    df, was_local = load_normalized(csv_path)
    if was_local:
        any_local = True
    df = df.dropna(subset=["r_norm", "h_norm"]).sort_values(["azimuth", "distance_m"])

    for az, g in df.groupby("azimuth"):
        ax.plot(g["r_norm"], g["h_norm"], color=color, alpha=0.25, lw=1)

    mean_curve = df.groupby("distance_m")[["r_norm", "h_norm"]].mean().sort_values("r_norm")
    ax.plot(mean_curve["r_norm"], mean_curve["h_norm"], color=color, lw=2.5, label=name)
    plotted += 1
    print(f"{name}: {csv_path} -- {'локальная нормировка' if was_local else 'из CSV'}")

if plotted == 0:
    raise SystemExit(
        "Не найдено ни одного подходящего CSV (ни *_profile_normalized_*.csv, ни profile_*.csv). "
        "Сначала выполните экспорт профиля в gee_crater_app.js."
    )

ax.axhline(0, color=FG, lw=1, ls="--", alpha=0.4, label="дно (h_norm=0)")
ax.axhline(1, color=FG, lw=1, ls="--", alpha=0.4, label="гребень (h_norm=1)")
ax.axvline(1, color=FG, lw=0.8, ls=":", alpha=0.3)

ax.set_xlabel("Нормированное расстояние, r_norm = distance / mean_rim_radius", color=FG, fontsize=11)
ax.set_ylabel("Нормированная высота, h_norm = (DEM − floor) / (rim − floor)", color=FG, fontsize=11)
title = "Сравнение формы кратеров независимо от масштаба"
if any_local:
    title += "\n(часть кривых нормирована локально в Python — старый формат экспорта)"
ax.set_title(title, color=FG, fontsize=13, pad=14)
ax.tick_params(colors=FG)
for spine in ax.spines.values():
    spine.set_color(FG)
    spine.set_alpha(0.3)
ax.grid(True, color=FG, alpha=0.12, lw=0.5)
ax.legend(frameon=False, fontsize=10, labelcolor=FG, loc="upper right")
ax.set_xlim(0, 2)

plt.tight_layout()
plt.savefig("normalized_profile_compare.png", dpi=200, facecolor=BG)
print("Сохранено: normalized_profile_compare.png")
