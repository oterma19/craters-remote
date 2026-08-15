"""
Радарный (Sentinel-1) отклик: сравнение обратного рассеяния VV на дне
и на валу кратера -- количественное подтверждение того, что вал/склоны
дают более высокое обратное рассеяние (шероховатость + геометрия),
чем ровное дно, независимо от типа кратера.

Запуск: python radar_backscatter_chart.py
"""

import glob

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

JOBS = [
    ("profile_Barringer__Meteor_Crater______.csv", "Барринджер", 300, 900, "#c1440e"),
    ("profile_Lonar_______.csv", "Lonar", 400, 1200, "#5b8a72"),
    ("profile_Wolfe_Creek___________.csv", "Wolfe Creek", 150, 500, "#e0a458"),
]

BG = "#10203c"
FG = "#e8e6df"
plt.rcParams["font.family"] = "DejaVu Sans"

names, floor_vv, rim_vv, colors = [], [], [], []
for csv, name, rim_min, rim_max, color in JOBS:
    matches = glob.glob(csv)
    if not matches:
        continue
    df = pd.read_csv(matches[0])
    floor = df[df["distance_m"] < 60]["VV"].mean()
    rim = df[(df["distance_m"] >= rim_min) & (df["distance_m"] <= rim_max)]["VV"].mean()
    names.append(name)
    floor_vv.append(floor)
    rim_vv.append(rim)
    colors.append(color)
    print(f"{name}: дно VV={floor:.1f} дБ, вал VV={rim:.1f} дБ, разница={rim-floor:.1f} дБ")

fig, ax = plt.subplots(figsize=(9, 6.4), facecolor=BG)
ax.set_facecolor(BG)

x = np.arange(len(names))
width = 0.32

b1 = ax.bar(x - width / 2, floor_vv, width, color=FG, alpha=0.35, label="дно кратера")
b2 = ax.bar(x + width / 2, rim_vv, width, color=colors, alpha=0.95, label="вал кратера")

for i in range(len(names)):
    ax.text(x[i] - width / 2, floor_vv[i] - 1.2, f"{floor_vv[i]:.1f}", ha="center",
            va="top", color=FG, fontsize=9.5)
    ax.text(x[i] + width / 2, rim_vv[i] + 0.4, f"{rim_vv[i]:.1f}", ha="center",
            va="bottom", color=FG, fontsize=9.5, fontweight="bold")
    ax.annotate(
        "", xy=(x[i] + width / 2, rim_vv[i]), xytext=(x[i] - width / 2, floor_vv[i]),
        arrowprops=dict(arrowstyle="->", color=colors[i], lw=1.3, alpha=0.7,
                         connectionstyle="arc3,rad=-0.25"),
    )
    ax.text(x[i], max(rim_vv[i], floor_vv[i]) + 3.2, f"+{rim_vv[i]-floor_vv[i]:.1f} дБ",
            ha="center", color=colors[i], fontsize=10.5, fontweight="bold")

ax.set_xticks(x)
ax.set_xticklabels(names, color=FG, fontsize=11)
ax.set_ylabel("VV, дБ (среднее по зоне)", color=FG, fontsize=11)
ax.set_title("Радар (Sentinel-1): вал во всех трёх кратерах ярче дна",
              color=FG, fontsize=13.5, pad=14)
ax.tick_params(colors=FG)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.grid(axis="y", color=FG, alpha=0.12, lw=0.6)
ax.legend(frameon=False, fontsize=10, labelcolor=FG, loc="lower right")
ax.set_ylim(min(floor_vv) - 4, max(rim_vv) + 6)

plt.tight_layout()
plt.savefig("radar_backscatter.png", dpi=200, facecolor=BG)
print("Сохранено: radar_backscatter.png")
