from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from create_rf_library_glb_models import (  # noqa: E402
    MODELS_DIR,
    add_label_empty,
    cylinder_x,
    ensure_dirs,
    helical_ribbon,
    make_material,
    reset_scene,
    tube_surface,
)
from create_rf_macro_glb_models import (  # noqa: E402
    add_braid_fray,
    add_dielectric_detail,
    add_foil_detail,
    add_jacket_detail,
    add_macro_braid,
    add_macro_conductor,
    curve_from_points,
    finish_and_export,
)


def add_flatwire_bank(
    objects: list[bpy.types.Object],
    *,
    label: str,
    x0: float,
    x1: float,
    radius: float,
    turns: float,
    bobbins: int,
    width_angle: float,
    mat_a: bpy.types.Material,
    mat_b: bpy.types.Material,
    handedness: int,
    phase_offset: float = 0,
) -> None:
    for index in range(bobbins):
        phase = phase_offset + math.tau * index / bobbins
        mat = mat_a if index % 2 == 0 else mat_b
        obj = helical_ribbon(
            f"{label} flatwire bobbin {index + 1:02d}",
            x0,
            x1,
            radius,
            turns,
            phase,
            width_angle,
            mat,
            handedness=handedness,
            segments=220,
        )
        objects.append(obj)


def add_ptfe_tape_laps(
    objects: list[bpy.types.Object],
    *,
    x0: float,
    x1: float,
    radius: float,
    turns: float,
    mat: bpy.types.Material,
) -> None:
    for index, phase in enumerate((0, 112, 224), start=1):
        objects.append(
            helical_ribbon(
                f"PTFE tape dielectric lap {index:02d}",
                x0 + 0.03 * index,
                x1 - 0.04 * index,
                radius,
                turns + 0.14 * index,
                math.radians(phase),
                math.radians(18),
                mat,
                segments=170,
            )
        )


def add_foil_seam(objects: list[bpy.types.Object], *, x0: float, x1: float, radius: float, mat: bpy.types.Material) -> None:
    seam_points = []
    for step in range(72):
        t = step / 71
        x = x0 + (x1 - x0) * t
        angle = math.radians(24) + 0.08 * math.sin(t * math.tau * 3.0)
        seam_points.append((x, radius * 1.026 * math.cos(angle), radius * 1.026 * math.sin(angle)))
    objects.append(curve_from_points("foil overlap seam bright line", seam_points, mat, bevel_depth=0.006, bevel_resolution=1))


def add_end_callout_ticks(objects: list[bpy.types.Object], *, mat: bpy.types.Material) -> None:
    ticks = [
        ("PTFE build gauge", 1.42, 0.39),
        ("SPC spiral gauge", 1.14, 0.46),
        ("SPC helical gauge", 0.86, 0.53),
        ("foil gauge", 0.58, 0.60),
        ("braid gauge", 0.30, 0.68),
    ]
    for label, x, radius in ticks:
        for phase in (math.radians(84), math.radians(96)):
            path = [
                (x, radius * math.cos(phase), radius * math.sin(phase)),
                (x + 0.22, (radius + 0.18) * math.cos(phase), (radius + 0.18) * math.sin(phase)),
            ]
            objects.append(curve_from_points(label, path, mat, bevel_depth=0.004, bevel_resolution=1))


def build_rf_stack_lab_macro() -> None:
    ensure_dirs()
    reset_scene()

    root = add_label_empty("RF Stack Lab macro GLB root")
    objects: list[bpy.types.Object] = []

    copper = make_material("solid copper conductor", (0.92, 0.43, 0.16, 1), metallic=0.92, roughness=0.16)
    copper_hi = make_material("copper hot edge highlight", (1.0, 0.57, 0.18, 1), metallic=0.9, roughness=0.1)
    ptfe_core = make_material("warm PTFE dielectric core", (0.95, 0.88, 0.68, 1), roughness=0.38)
    ptfe_tape = make_material("semi matte PTFE tape laps", (1.0, 0.95, 0.76, 1), roughness=0.28, alpha=0.96)
    silver_a = make_material("SPC flatwire bright face", (0.88, 0.87, 0.78, 1), metallic=0.78, roughness=0.22)
    silver_b = make_material("SPC flatwire shaded face", (0.58, 0.59, 0.55, 1), metallic=0.78, roughness=0.32)
    helical_a = make_material("SPC helical warm flatwire", (0.74, 0.78, 0.77, 1), metallic=0.75, roughness=0.24)
    helical_b = make_material("SPC helical cool shadow", (0.44, 0.51, 0.53, 1), metallic=0.72, roughness=0.34)
    foil = make_material("opaque aluminum foil shield", (0.86, 0.84, 0.72, 1), metallic=0.82, roughness=0.2)
    braid_light = make_material("woven braid bright tinned copper", (0.82, 0.80, 0.70, 1), metallic=0.86, roughness=0.24)
    braid_dark = make_material("woven braid under strand shadow", (0.46, 0.44, 0.38, 1), metallic=0.76, roughness=0.38)
    jacket = make_material("matte black FEP jacket", (0.018, 0.018, 0.016, 1), roughness=0.82)
    jacket_edge = make_material("jacket cut edge rubber shadow", (0.035, 0.031, 0.028, 1), roughness=0.86)
    callout = make_material("thin layer callout ticks", (0.64, 0.96, 0.90, 1), metallic=0.1, roughness=0.45)

    x_min, x_max = -2.15, 2.85
    conductor_r = 0.105
    dielectric_r = 0.37
    spiral_r = 0.455
    helical_r = 0.525
    foil_r = 0.596
    braid_r = 0.68
    jacket_r = 0.81

    add_macro_conductor(objects, x0=x_min + 0.1, x1=x_max, radius=conductor_r, mat=copper, strands=7)
    objects.append(cylinder_x("polished continuous conductor nose", x_max + 0.012, 0.024, conductor_r * 1.02, copper_hi, vertices=96))

    objects.append(cylinder_x("PTFE dielectric build body", 0.48, 3.58, dielectric_r, ptfe_core, vertices=144))
    add_dielectric_detail(objects, kind="ptfe", x0=-1.24, x1=2.22, radius=dielectric_r, base_color=(0.95, 0.88, 0.68, 1))
    add_ptfe_tape_laps(objects, x0=-0.98, x1=2.12, radius=dielectric_r * 1.018, turns=6.8, mat=ptfe_tape)

    add_flatwire_bank(
        objects,
        label="SPC spiral shield",
        x0=-0.86,
        x1=1.72,
        radius=spiral_r,
        turns=5.4,
        bobbins=8,
        width_angle=math.radians(4.9),
        mat_a=silver_a,
        mat_b=silver_b,
        handedness=1,
        phase_offset=math.radians(7),
    )
    add_flatwire_bank(
        objects,
        label="SPC helical shield",
        x0=-1.10,
        x1=1.38,
        radius=helical_r,
        turns=4.8,
        bobbins=6,
        width_angle=math.radians(6.2),
        mat_a=helical_a,
        mat_b=helical_b,
        handedness=-1,
        phase_offset=math.radians(26),
    )

    objects.append(tube_surface("opaque foil shield sleeve", -1.34, 0.92, foil_r, foil, radial_segments=144, length_segments=40))
    add_foil_detail(objects, x0=-1.34, x1=0.92, radius=foil_r, foil_mat=foil)
    add_foil_seam(objects, x0=-1.30, x1=0.88, radius=foil_r, mat=foil)

    add_macro_braid(
        objects,
        label="outer woven braid shield",
        x0=-1.62,
        x1=0.56,
        radius=braid_r,
        turns=4.9,
        carriers=18,
        light=braid_light,
        dark=braid_dark,
        strand_radius=0.008,
        filaments=3,
        phase_offset=math.radians(11),
    )
    add_braid_fray(objects, label="outer braid inspection edge", x=0.56, radius=braid_r, mat=braid_light, strand_radius=0.008, count=32)

    objects.append(cylinder_x("full black jacket section", -1.96, 1.44, jacket_r, jacket, vertices=144))
    add_jacket_detail(
        objects,
        x0=-2.68,
        x1=-1.24,
        cut_x=-1.24,
        radius=jacket_r,
        jacket_color=(0.018, 0.018, 0.016, 1),
        body_mat=jacket,
        edge_mat=jacket_edge,
    )
    add_end_callout_ticks(objects, mat=callout)

    # Small base plane gives the macro studio lighting something to reflect without framing the model.
    plane_mat = make_material("dark nonreflective inspection table", (0.02, 0.026, 0.026, 1), roughness=0.92)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.10, 0, -1.02))
    table = bpy.context.object
    table.name = "low dark inspection table"
    table.scale = (3.8, 1.65, 0.025)
    table.data.materials.append(plane_mat)
    objects.append(table)

    finish_and_export(root, objects, {"macro_slug": "rf-stack-lab-macro"})
    print(f"Exported {MODELS_DIR / 'rf-stack-lab-macro.glb'}")


if __name__ == "__main__":
    build_rf_stack_lab_macro()
