from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from create_rf_library_glb_models import (
    MODELS_DIR,
    ROOT,
    add_label_empty,
    braid_material_color,
    conductor_offsets,
    conductor_material_color,
    dielectric_material_color,
    ensure_dirs,
    extract_js_object,
    iter_top_level_entries,
    jacket_cut_color,
    js_string,
    make_material,
    reset_scene,
    spec_from_catalog_entry,
    tube_surface,
    cylinder_x,
    helical_ribbon,
)


TARGET_IDS: tuple[str, ...] = ()


def scale_color(
    color: tuple[float, float, float, float],
    factor: float,
    *,
    alpha: float | None = None,
) -> tuple[float, float, float, float]:
    return (
        max(0, min(color[0] * factor, 1)),
        max(0, min(color[1] * factor, 1)),
        max(0, min(color[2] * factor, 1)),
        color[3] if alpha is None else alpha,
    )


def curve_from_points(
    name: str,
    points: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    bevel_depth: float,
    bevel_resolution: int = 2,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = bevel_resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def add_macro_braid(
    objects: list[bpy.types.Object],
    *,
    label: str,
    x0: float,
    x1: float,
    radius: float,
    turns: float,
    carriers: int,
    light: bpy.types.Material,
    dark: bpy.types.Material,
    strand_radius: float,
    filaments: int,
    phase_offset: float = 0,
) -> None:
    carrier_count = max(10, min(18, carriers if carriers % 2 == 0 else carriers + 1))
    points = 104
    filament_spacing = math.radians(1.1)

    for handedness, material, lift, material_name in (
        (1, light, strand_radius * 1.1, "bright"),
        (-1, dark, strand_radius * 2.4, "shadow"),
    ):
        for carrier in range(carrier_count):
            base_phase = phase_offset + math.tau * carrier / carrier_count
            for filament in range(filaments):
                offset = (filament - (filaments - 1) / 2) * filament_spacing
                path: list[tuple[float, float, float]] = []
                for step in range(points):
                    t = step / (points - 1)
                    x = x0 + (x1 - x0) * t
                    angle = base_phase + offset + handedness * turns * math.tau * t
                    weave = 0.5 + 0.5 * math.sin((t * carrier_count * 2.0 + carrier * 0.37 + filament * 0.19) * math.tau)
                    r = radius + lift + strand_radius * 0.75 * weave
                    path.append((x, r * math.cos(angle), r * math.sin(angle)))
                objects.append(
                    curve_from_points(
                        f"{label} {material_name} carrier {carrier + 1:02d} strand {filament + 1}",
                        path,
                        material,
                        bevel_depth=strand_radius,
                        bevel_resolution=2,
                    )
                )


def add_braid_fray(
    objects: list[bpy.types.Object],
    *,
    label: str,
    x: float,
    radius: float,
    mat: bpy.types.Material,
    strand_radius: float,
    count: int = 26,
) -> None:
    for index in range(count):
        phase = math.tau * index / count
        length = 0.08 + 0.10 * ((index * 7) % 11) / 10
        flare = math.radians(-8 + ((index * 13) % 17))
        lift = 1 + 0.028 * math.sin(index * 2.1)
        path = [
            (x - 0.025, radius * math.cos(phase), radius * math.sin(phase)),
            (x + length * 0.45, radius * lift * math.cos(phase + flare * 0.45), radius * lift * math.sin(phase + flare * 0.45)),
            (x + length, radius * (lift + 0.035) * math.cos(phase + flare), radius * (lift + 0.035) * math.sin(phase + flare)),
        ]
        objects.append(
            curve_from_points(
                f"{label} loose braid tail {index + 1:02d}",
                path,
                mat,
                bevel_depth=strand_radius * 0.62,
                bevel_resolution=1,
            )
        )


def add_axial_surface_lines(
    objects: list[bpy.types.Object],
    *,
    label: str,
    x0: float,
    x1: float,
    radius: float,
    mat: bpy.types.Material,
    count: int,
    bevel_depth: float,
    phase_offset: float = 0,
    wobble: float = 0,
    points: int = 18,
) -> None:
    for index in range(count):
        phase = phase_offset + math.tau * index / count
        path: list[tuple[float, float, float]] = []
        for step in range(points):
            t = step / (points - 1)
            x = x0 + (x1 - x0) * t
            angle = phase + wobble * math.sin((t * 2.0 + index * 0.17) * math.tau)
            path.append((x, radius * math.cos(angle), radius * math.sin(angle)))
        objects.append(
            curve_from_points(
                f"{label} axial surface line {index + 1:02d}",
                path,
                mat,
                bevel_depth=bevel_depth,
                bevel_resolution=1,
            )
        )


def add_jacket_detail(
    objects: list[bpy.types.Object],
    *,
    x0: float,
    x1: float,
    cut_x: float,
    radius: float,
    jacket_color: tuple[float, float, float, float],
    body_mat: bpy.types.Material,
    edge_mat: bpy.types.Material,
) -> None:
    highlight = make_material("jacket satin rub highlights", scale_color(jacket_color, 2.8), roughness=0.92)
    lowlight = make_material("jacket shallow extrusion valleys", scale_color(jacket_color, 0.55), roughness=0.96)
    print_mat = make_material("low gloss jacket print", (0.18, 0.20, 0.18, 1), roughness=0.78)

    objects.append(tube_surface("rounded jacket cut lip", cut_x - 0.035, cut_x + 0.035, radius * 1.018, edge_mat, radial_segments=144, length_segments=3))
    objects.append(tube_surface("inner jacket shadow bevel", cut_x + 0.02, cut_x + 0.13, radius * 0.992, body_mat, radial_segments=144, length_segments=4))
    add_axial_surface_lines(
        objects,
        label="jacket",
        x0=x0 + 0.12,
        x1=x1 - 0.08,
        radius=radius * 1.004,
        mat=highlight,
        count=9,
        bevel_depth=max(0.0025, radius * 0.0032),
        phase_offset=math.radians(12),
        wobble=0.006,
        points=22,
    )
    add_axial_surface_lines(
        objects,
        label="jacket",
        x0=x0 + 0.08,
        x1=x1 - 0.12,
        radius=radius * 1.002,
        mat=lowlight,
        count=7,
        bevel_depth=max(0.002, radius * 0.0028),
        phase_offset=math.radians(33),
        wobble=0.004,
        points=18,
    )
    for index, x in enumerate((-2.58, -2.25, -1.92), start=1):
        objects.append(
            helical_ribbon(
                f"faint jacket ink registration dash {index:02d}",
                x,
                x + 0.16,
                radius * 1.008,
                0.0,
                math.radians(104),
                math.radians(3.0),
                print_mat,
                segments=6,
            )
        )


def add_dielectric_detail(
    objects: list[bpy.types.Object],
    *,
    kind: str,
    x0: float,
    x1: float,
    radius: float,
    base_color: tuple[float, float, float, float],
) -> None:
    line_color = scale_color(base_color, 1.12)
    valley_color = scale_color(base_color, 0.86)
    pore_color = (0.74, 0.72, 0.61, 1) if kind == "foam_pe" else scale_color(base_color, 0.78)
    line_mat = make_material("dielectric polished extrusion ridges", line_color, roughness=0.56)
    valley_mat = make_material("dielectric shallow valleys", valley_color, roughness=0.66)
    pore_mat = make_material("foam dielectric tiny pores", pore_color, roughness=0.9)

    add_axial_surface_lines(
        objects,
        label="dielectric highlight",
        x0=x0,
        x1=x1,
        radius=radius * 1.01,
        mat=line_mat,
        count=10,
        bevel_depth=max(0.0022, radius * 0.0026),
        phase_offset=math.radians(8),
        wobble=0.002,
        points=18,
    )
    add_axial_surface_lines(
        objects,
        label="dielectric valley",
        x0=x0 + 0.04,
        x1=x1 - 0.03,
        radius=radius * 1.006,
        mat=valley_mat,
        count=8,
        bevel_depth=max(0.0018, radius * 0.0022),
        phase_offset=math.radians(25),
        wobble=0.002,
        points=15,
    )

    pore_count = 46 if kind == "foam_pe" else 18
    pore_radius = max(0.006, radius * (0.010 if kind == "foam_pe" else 0.006))
    for index in range(pore_count):
        t = ((index * 37) % 101) / 101
        x = x0 + (x1 - x0) * (0.06 + 0.88 * t)
        angle = math.radians((index * 137.5) % 360)
        radial = radius * 1.018
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=8,
            ring_count=4,
            radius=pore_radius * (0.65 + ((index * 11) % 7) * 0.06),
            location=(x, radial * math.cos(angle), radial * math.sin(angle)),
        )
        pore = bpy.context.object
        pore.name = f"dielectric visible pore {index + 1:02d}"
        pore.scale.x = 0.22
        pore.data.materials.append(pore_mat)
        bpy.ops.object.shade_smooth()
        objects.append(pore)


def add_foil_detail(
    objects: list[bpy.types.Object],
    *,
    x0: float,
    x1: float,
    radius: float,
    foil_mat: bpy.types.Material,
) -> None:
    bright = make_material("foil sharp crinkle highlights", (0.98, 0.97, 0.88, 1), metallic=0.9, roughness=0.18)
    shadow = make_material("foil folded edge shadow", (0.38, 0.38, 0.34, 1), metallic=0.7, roughness=0.36)

    for index, phase in enumerate((8, 74, 139, 211, 292), start=1):
        objects.append(
            helical_ribbon(
                f"foil wrap crinkle highlight {index:02d}",
                x0 + 0.02 * index,
                x1 - 0.05,
                radius * 1.018,
                0.34 + index * 0.045,
                math.radians(phase),
                math.radians(1.25),
                bright if index % 2 else shadow,
                segments=72,
            )
        )

    for index, phase in enumerate((64, 252), start=1):
        objects.append(
            helical_ribbon(
                f"lifted foil inspection flap {index:02d}",
                x1 - 0.36 + index * 0.025,
                x1 - 0.04,
                radius * 1.075,
                0.08,
                math.radians(phase),
                math.radians(15),
                bright,
                segments=28,
            )
        )

    for index in range(24):
        phase = math.tau * index / 24
        length = 0.035 + 0.055 * ((index * 5) % 9) / 8
        angle = phase + math.radians(-4 + ((index * 17) % 9))
        path = [
            (x1 - 0.015, radius * 1.02 * math.cos(phase), radius * 1.02 * math.sin(phase)),
            (x1 + length, radius * 1.027 * math.cos(angle), radius * 1.027 * math.sin(angle)),
        ]
        objects.append(
            curve_from_points(
                f"foil torn bright edge {index + 1:02d}",
                path,
                bright if index % 3 else foil_mat,
                bevel_depth=max(0.002, radius * 0.0028),
                bevel_resolution=1,
            )
        )


def add_macro_conductor(
    objects: list[bpy.types.Object],
    *,
    x0: float,
    x1: float,
    radius: float,
    mat: bpy.types.Material,
    strands: int,
) -> None:
    highlight = make_material("conductor warm edge highlight", (1.0, 0.56, 0.18, 1), metallic=0.9, roughness=0.12)

    if strands <= 1:
        objects.append(cylinder_x("polished solid center conductor", (x0 + x1) / 2, x1 - x0, radius, mat, vertices=128))
        add_axial_surface_lines(
            objects,
            label="conductor",
            x0=x0 + 0.05,
            x1=x1 - 0.02,
            radius=radius * 1.015,
            mat=highlight,
            count=5,
            bevel_depth=max(0.002, radius * 0.006),
            phase_offset=math.radians(15),
            points=12,
        )
        objects.append(cylinder_x("polished conductor cut face glow", x1 + 0.003, 0.012, radius * 1.01, highlight, vertices=128))
        return

    strand_r, offsets = conductor_offsets(strands, radius)
    twist_turns = 0.68 if strands <= 7 else 0.92
    for index, (base_y, base_z) in enumerate(offsets, start=1):
        if abs(base_y) < 0.0001 and abs(base_z) < 0.0001:
            objects.append(cylinder_x(f"{strands} strand center conductor core", (x0 + x1) / 2, x1 - x0, strand_r, mat, vertices=48))
            continue
        base_angle = math.atan2(base_z, base_y)
        offset_r = math.hypot(base_y, base_z)
        path: list[tuple[float, float, float]] = []
        for step in range(80):
            t = step / 79
            x = x0 + (x1 - x0) * t
            angle = base_angle + twist_turns * math.tau * t
            path.append((x, offset_r * math.cos(angle), offset_r * math.sin(angle)))
        objects.append(
            curve_from_points(
                f"{strands} strand conductor continuous twist {index:02d}",
                path,
                mat if index % 2 else highlight,
                bevel_depth=strand_r,
                bevel_resolution=3,
            )
        )


def finish_and_export(root: bpy.types.Object, objects: list[bpy.types.Object], spec: dict) -> None:
    for obj in objects:
        obj.parent = root

    root.rotation_euler = (math.radians(-5.5), 0, math.radians(-2.5))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *objects]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.export_scene.gltf(
        filepath=str(MODELS_DIR / f"{spec['macro_slug']}.glb"),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_current_frame=True,
    )


def load_target_specs() -> dict[str, dict]:
    source = (ROOT / "src" / "pages" / "RFApp.jsx").read_text(encoding="utf-8")
    block = extract_js_object(source, "const CABLES =")
    targets = set(TARGET_IDS)
    specs: dict[str, dict] = {}
    for cable_id, entry in iter_top_level_entries(block):
        if not targets or cable_id in targets:
            spec = spec_from_catalog_entry(cable_id, entry)
            spec["id"] = cable_id
            spec["macro_slug"] = f"{spec['slug']}-macro"
            spec["jacket_text"] = js_string(entry, "jacket")
            specs[cable_id] = spec
    missing = targets - set(specs) if targets else set()
    if missing:
        raise RuntimeError(f"Missing macro cable specs: {', '.join(sorted(missing))}")
    return specs


def build_macro_video_coax_model(spec: dict) -> None:
    reset_scene()
    root = add_label_empty(f"{spec['name']} macro GLB root")

    scale = 0.27
    outer_r = spec["od_mm"] * 0.5 * scale
    braid_r = spec["shield_mm"] * 0.5 * scale
    foil_r = braid_r * 0.958
    dielectric_r = spec["dielectric_mm"] * 0.5 * scale
    conductor_r = spec["d_mm"] * 0.5 * scale

    conductor_kind = spec.get("conductor_material", "bare_copper")
    dielectric_kind = spec.get("dielectric_material", "foam_pe")
    braid_kind = spec.get("braid_material", "tinned_copper")
    dielectric_name, dielectric_color, dielectric_alpha = dielectric_material_color(dielectric_kind)
    braid_color, braid_shadow_color = braid_material_color(braid_kind)

    copper = make_material(
        f"{conductor_kind.replace('_', ' ')} macro conductor",
        conductor_material_color(conductor_kind),
        metallic=0.92,
        roughness=0.14,
    )
    dielectric = make_material(dielectric_name, dielectric_color, roughness=0.62, alpha=1)
    foil = make_material("opaque crinkled aluminum foil shield", (0.92, 0.91, 0.84, 1), metallic=0.86, roughness=0.2)
    foil_shadow = make_material("foil lap shadow", (0.46, 0.46, 0.40, 1), metallic=0.55, roughness=0.42)
    braid_light = make_material(f"individual {braid_kind.replace('_', ' ')} braid wires", braid_color, metallic=0.82, roughness=0.26)
    braid_dark = make_material("braid underpass shadow wires", braid_shadow_color, metallic=0.72, roughness=0.42)
    braid_recess = make_material(
        "deep braid diamond gaps",
        tuple(max(c * 0.34, 0.028) for c in braid_shadow_color[:3]) + (1,),
        metallic=0.18,
        roughness=0.78,
    )
    jacket = make_material("macro matte jacket", spec["jacket_color"], roughness=0.88)
    jacket_edge = make_material("macro jacket cut wall", jacket_cut_color(spec["jacket_color"]), roughness=0.8)

    objects: list[bpy.types.Object] = []
    braid_start = -0.24
    braid_end = 1.26
    foil_end = 1.74

    objects.append(cylinder_x("macro jacket body", -1.72, 3.05, outer_r, jacket, vertices=128))
    objects.append(cylinder_x("thick jacket cut wall", -0.16, 0.22, outer_r * 1.012, jacket_edge, vertices=128))
    add_jacket_detail(
        objects,
        x0=-3.18,
        x1=-0.32,
        cut_x=-0.19,
        radius=outer_r,
        jacket_color=spec["jacket_color"],
        body_mat=jacket,
        edge_mat=jacket_edge,
    )

    has_foil = spec.get("foil", False)
    if has_foil:
        objects.append(
            tube_surface(
                "continuous foil sleeve under braid",
                braid_start - 0.03,
                foil_end,
                foil_r,
                foil,
                radial_segments=112,
                length_segments=64,
            )
        )
        objects.append(
            helical_ribbon(
                "raised foil lap seam",
                braid_start + 0.10,
                foil_end,
                foil_r * 1.014,
                1.2,
                math.radians(18),
                math.radians(24),
                foil_shadow,
                segments=160,
            )
        )
        add_foil_detail(objects, x0=braid_start - 0.02, x1=foil_end, radius=foil_r, foil_mat=foil)

    objects.append(
        tube_surface(
            "shadow seen through braid windows",
            braid_start,
            braid_end,
            braid_r * 0.992,
            braid_recess,
            radial_segments=120,
            length_segments=18,
        )
    )

    carrier_count = max(12, min(16, int(round(spec.get("braid_carriers", 16) * 0.72))))
    if carrier_count % 2:
        carrier_count += 1
    strand_radius = max(0.0065, outer_r * 0.0068)
    filaments = 3 if spec["od_mm"] >= 7 else 2
    display_turns = 2.1 if spec["od_mm"] >= 9 else 2.35
    if spec.get("double_braid") or spec.get("quad_shield"):
        add_macro_braid(
            objects,
            label="inner macro braid",
            x0=braid_start + 0.06,
            x1=braid_end + 0.18,
            radius=braid_r * 0.925,
            turns=display_turns * 0.92,
            carriers=max(10, carrier_count - 2),
            light=braid_dark,
            dark=braid_light,
            strand_radius=strand_radius * 0.74,
            filaments=max(2, filaments - 1),
            phase_offset=math.radians(18),
        )
    add_macro_braid(
        objects,
        label="macro braid",
        x0=braid_start,
        x1=braid_end,
        radius=braid_r,
        turns=display_turns,
        carriers=carrier_count,
        light=braid_light,
        dark=braid_dark,
        strand_radius=strand_radius,
        filaments=filaments,
    )
    add_braid_fray(
        objects,
        label="macro braid",
        x=braid_end,
        radius=braid_r + strand_radius * 2.2,
        mat=braid_light,
        strand_radius=strand_radius,
        count=20 if spec["od_mm"] >= 7 else 14,
    )

    objects.append(cylinder_x("macro dielectric exposed core", 1.88, 1.56, dielectric_r, dielectric, vertices=128))
    add_dielectric_detail(
        objects,
        kind=dielectric_kind,
        x0=1.14,
        x1=2.62,
        radius=dielectric_r,
        base_color=dielectric_color,
    )

    add_macro_conductor(
        objects,
        x0=0.12,
        x1=3.18,
        radius=conductor_r,
        mat=copper,
        strands=spec.get("conductor_strands", 1),
    )

    finish_and_export(root, objects, spec)


def build_macro_hardline_model(spec: dict) -> None:
    reset_scene()
    root = add_label_empty(f"{spec['name']} macro hardline GLB root")

    scale = 0.18 if spec["od_mm"] >= 18 else 0.24
    outer_r = spec["od_mm"] * 0.5 * scale
    shield_r = spec["shield_mm"] * 0.5 * scale
    dielectric_r = spec["dielectric_mm"] * 0.5 * scale
    conductor_r = spec["d_mm"] * 0.5 * scale

    conductor_kind = spec.get("conductor_material", "bare_copper")
    dielectric_kind = spec.get("dielectric_material", "foam_pe")
    dielectric_name, dielectric_color, _ = dielectric_material_color(dielectric_kind)
    copper = make_material("corrugated copper outer conductor", (0.82, 0.40, 0.16, 1), metallic=0.9, roughness=0.2)
    copper_shadow = make_material("corrugation valley copper shadow", (0.36, 0.16, 0.05, 1), metallic=0.75, roughness=0.36)
    center = make_material(f"{conductor_kind.replace('_', ' ')} macro conductor", conductor_material_color(conductor_kind), metallic=0.92, roughness=0.14)
    dielectric = make_material(dielectric_name, dielectric_color, roughness=0.66, alpha=1)
    spacer = make_material("low loss PE air spacer", (0.90, 0.88, 0.74, 1), roughness=0.54)
    jacket = make_material("hardline matte jacket", spec["jacket_color"], roughness=0.9)
    jacket_edge = make_material("hardline jacket cut wall", jacket_cut_color(spec["jacket_color"]), roughness=0.82)

    objects: list[bpy.types.Object] = []
    objects.append(cylinder_x("macro hardline jacket body", -1.72, 3.05, outer_r, jacket, vertices=128))
    objects.append(cylinder_x("hardline jacket cut wall", -0.18, 0.20, outer_r * 1.012, jacket_edge, vertices=128))
    add_jacket_detail(
        objects,
        x0=-3.18,
        x1=-0.34,
        cut_x=-0.19,
        radius=outer_r,
        jacket_color=spec["jacket_color"],
        body_mat=jacket,
        edge_mat=jacket_edge,
    )
    objects.append(
        tube_surface(
            "annular corrugated solid shield",
            -0.26,
            1.52,
            shield_r,
            copper,
            corrugation_amp=max(0.018, min(0.07, shield_r * 0.035)),
            corrugation_count=spec.get("corrugation_count", 18),
            radial_segments=128,
            length_segments=96,
        )
    )
    add_axial_surface_lines(
        objects,
        label="corrugated shield",
        x0=-0.20,
        x1=1.46,
        radius=shield_r * 1.028,
        mat=copper_shadow,
        count=8,
        bevel_depth=max(0.003, shield_r * 0.0026),
        phase_offset=math.radians(9),
        wobble=0.01,
        points=24,
    )

    if spec.get("air_dielectric"):
        objects.append(cylinder_x("air dielectric visual envelope", 1.88, 1.54, dielectric_r, make_material("clear air dielectric silhouette", (0.78, 0.86, 0.84, 1), roughness=0.1, alpha=0.18), vertices=96))
        objects.append(
            helical_ribbon(
                "continuous PE helical air spacer",
                1.08,
                2.66,
                max(conductor_r * 1.55, dielectric_r * 0.62),
                3.25,
                math.radians(22),
                math.radians(10),
                spacer,
                segments=120,
            )
        )
    else:
        objects.append(cylinder_x("macro foam dielectric exposed core", 1.88, 1.54, dielectric_r, dielectric, vertices=128))
        add_dielectric_detail(objects, kind=dielectric_kind, x0=1.14, x1=2.62, radius=dielectric_r, base_color=dielectric_color)

    add_macro_conductor(objects, x0=0.12, x1=3.18, radius=conductor_r, mat=center, strands=spec.get("conductor_strands", 1))
    finish_and_export(root, objects, spec)


def build_macro_semi_rigid_model(spec: dict) -> None:
    reset_scene()
    root = add_label_empty(f"{spec['name']} macro semi-rigid GLB root")

    scale = 0.34 if spec["od_mm"] <= 4 else 0.28
    outer_r = spec["od_mm"] * 0.5 * scale
    shield_r = spec["shield_mm"] * 0.5 * scale
    dielectric_r = spec["dielectric_mm"] * 0.5 * scale
    conductor_r = spec["d_mm"] * 0.5 * scale

    conductor_kind = spec.get("conductor_material", "silver")
    dielectric_kind = spec.get("dielectric_material", "ptfe")
    dielectric_name, dielectric_color, _ = dielectric_material_color(dielectric_kind)
    tube_color = (0.82, 0.58, 0.34, 1) if spec.get("outer_tube_material") == "bare_copper" else (0.82, 0.80, 0.72, 1)
    tube = make_material("semi rigid outer tube", tube_color, metallic=0.9, roughness=0.22)
    tube_edge = make_material("semi rigid bright tube edge", scale_color(tube_color, 1.18), metallic=0.95, roughness=0.16)
    center = make_material(f"{conductor_kind.replace('_', ' ')} macro conductor", conductor_material_color(conductor_kind), metallic=0.9, roughness=0.14)
    dielectric = make_material(dielectric_name, dielectric_color, roughness=0.52, alpha=1)
    jacket = make_material("thin optional FEP jacket", spec["jacket_color"], roughness=0.76, alpha=0.72)

    objects: list[bpy.types.Object] = []
    jacket_text = spec.get("jacket_text", "").lower()
    has_jacket = "fep" in jacket_text and "none" not in jacket_text
    if has_jacket:
        objects.append(cylinder_x("thin FEP rear jacket", -1.70, 2.65, outer_r, jacket, vertices=112))
    corrugation_amp = max(0.0, shield_r * 0.025) if spec.get("corrugated") else 0
    objects.append(
        tube_surface(
            "macro semi rigid tube shield",
            -0.42,
            1.48,
            shield_r,
            tube,
            corrugation_amp=corrugation_amp,
            corrugation_count=18 if spec.get("corrugated") else 1,
            radial_segments=128,
            length_segments=72,
        )
    )
    objects.append(cylinder_x("semi rigid tube cut rim", 1.42, 0.08, shield_r * 1.018, tube_edge, vertices=128))
    objects.append(cylinder_x("macro PTFE dielectric core", 1.88, 1.54, dielectric_r, dielectric, vertices=128))
    add_dielectric_detail(objects, kind=dielectric_kind, x0=1.14, x1=2.62, radius=dielectric_r, base_color=dielectric_color)
    add_macro_conductor(objects, x0=0.12, x1=3.18, radius=conductor_r, mat=center, strands=spec.get("conductor_strands", 1))
    finish_and_export(root, objects, spec)


def build_macro_model(spec: dict) -> None:
    if spec["family"] == "ava_hardline":
        build_macro_hardline_model(spec)
    elif spec["family"] == "semi_rigid":
        build_macro_semi_rigid_model(spec)
    else:
        build_macro_video_coax_model(spec)


def main() -> None:
    ensure_dirs()
    specs = load_target_specs()
    for cable_id in specs:
        build_macro_model(specs[cable_id])


if __name__ == "__main__":
    main()
