from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from create_rf_library_glb_models import MODELS_DIR, ROOT, cylinder_x, make_material, reset_scene


RENDERS_DIR = ROOT / "public" / "cable-renders"
GLB_PATH = MODELS_DIR / "highspeed-attenuation-macro.glb"
BLEND_PATH = MODELS_DIR / "highspeed-attenuation-macro.blend"
PREVIEW_PATH = RENDERS_DIR / "highspeed-attenuation-macro-preview.png"


def set_render_settings() -> None:
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 64
        if hasattr(scene.eevee, "use_bloom"):
            scene.eevee.use_bloom = True


def set_emission(mat: bpy.types.Material, color: tuple[float, float, float, float], strength: float) -> None:
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return
    for name in ("Emission Color", "Emission"):
        if name in bsdf.inputs:
            try:
                bsdf.inputs[name].default_value = color
            except TypeError:
                pass
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = strength


def smooth_obj(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def curve_from_points(
    name: str,
    points: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    bevel_depth: float,
    resolution: int = 3,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 6
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def tube_sector_x(
    name: str,
    x0: float,
    x1: float,
    inner_radius: float,
    outer_radius: float,
    start_angle: float,
    end_angle: float,
    mat: bpy.types.Material,
    *,
    radial_segments: int = 92,
    length_segments: int = 84,
    corrugation_amp: float = 0,
    corrugation_count: float = 1,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for ix in range(length_segments + 1):
        t = ix / length_segments
        x = x0 + (x1 - x0) * t
        ripple = corrugation_amp * math.sin(t * corrugation_count * math.tau)
        outer = outer_radius + ripple
        inner = max(0.001, inner_radius + ripple * 0.72)
        for ia in range(radial_segments + 1):
            u = ia / radial_segments
            angle = start_angle + (end_angle - start_angle) * u
            verts.append((x, outer * math.cos(angle), outer * math.sin(angle)))
            verts.append((x, inner * math.cos(angle), inner * math.sin(angle)))

    row_width = (radial_segments + 1) * 2
    for ix in range(length_segments):
        row = ix * row_width
        next_row = (ix + 1) * row_width
        for ia in range(radial_segments):
            o0 = row + ia * 2
            i0 = o0 + 1
            o1 = row + (ia + 1) * 2
            i1 = o1 + 1
            o0n = next_row + ia * 2
            i0n = o0n + 1
            o1n = next_row + (ia + 1) * 2
            i1n = o1n + 1
            faces.append([o0, o1, o1n, o0n])
            faces.append([i1, i0, i0n, i1n])

    for ix in range(length_segments):
        row = ix * row_width
        next_row = (ix + 1) * row_width
        for ia in (0, radial_segments):
            o0 = row + ia * 2
            i0 = o0 + 1
            o1 = next_row + ia * 2
            i1 = o1 + 1
            faces.append([o0, o1, i1, i0])

    for ix in (0, length_segments):
        row = ix * row_width
        for ia in range(radial_segments):
            o0 = row + ia * 2
            i0 = o0 + 1
            o1 = row + (ia + 1) * 2
            i1 = o1 + 1
            faces.append([o0, i0, i1, o1])

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return smooth_obj(obj)


def add_conductor_surface_lines(objects: list[bpy.types.Object], mat: bpy.types.Material) -> None:
    for index in range(10):
        phase = math.tau * index / 10
        path = []
        for step in range(42):
            t = step / 41
            x = -4.15 + 8.3 * t
            angle = phase + 0.07 * math.sin(t * math.tau * 2.5 + index)
            radius = 0.154
            path.append((x, radius * math.cos(angle), radius * math.sin(angle)))
        objects.append(curve_from_points(f"Conductor_micro_highlight_{index + 1:02d}", path, mat, bevel_depth=0.0028))


def add_jacket_texture_lines(objects: list[bpy.types.Object], mat: bpy.types.Material) -> None:
    for index in range(18):
        phase = math.radians(172 + (index % 6) * 12)
        z_offset = (index // 6 - 1) * 0.11
        path = []
        for step in range(18):
            t = step / 17
            x = -4.05 + 2.55 * t
            wobble = 0.018 * math.sin(t * math.tau * 2.0 + index * 0.7)
            radius = 0.908 + wobble
            path.append((x, radius * math.cos(phase), radius * math.sin(phase) + z_offset))
        objects.append(curve_from_points(f"Jacket_subtle_surface_scuff_{index + 1:02d}", path, mat, bevel_depth=0.0022, resolution=1))


def add_dielectric_field_lines(objects: list[bpy.types.Object], mat_a: bpy.types.Material, mat_b: bpy.types.Material) -> None:
    for index in range(14):
        mat = mat_a if index % 2 == 0 else mat_b
        base_x = -2.55 + index * 0.38
        phase = math.radians(35 + index * 21)
        path = []
        for step in range(60):
            t = step / 59
            x = base_x + 1.05 * t
            arch = math.sin(t * math.pi)
            angle = phase + 1.05 * arch
            radius = 0.28 + 0.30 * arch
            path.append((x, radius * math.cos(angle), radius * math.sin(angle)))
        objects.append(curve_from_points(f"Dielectric_Field_Line_{index + 1:02d}", path, mat, bevel_depth=0.0065))


def add_loss_heat_lines(objects: list[bpy.types.Object], mat: bpy.types.Material) -> None:
    for index in range(7):
        phase = math.radians(-35 + index * 11)
        path = []
        for step in range(64):
            t = step / 63
            x = -3.55 + 7.1 * t
            angle = phase + 0.12 * math.sin(t * math.tau * 3)
            radius = 0.169 + 0.006 * math.sin(t * math.tau * 6 + index)
            path.append((x, radius * math.cos(angle), radius * math.sin(angle)))
        objects.append(curve_from_points(f"Skin_Heat_Trace_{index + 1:02d}", path, mat, bevel_depth=0.006))


def pair_point(
    x: float,
    t: float,
    *,
    pair_radius: float,
    turns: float,
    phase: float,
) -> tuple[float, float, float]:
    angle = phase + turns * math.tau * t
    return (x, pair_radius * math.cos(angle), pair_radius * math.sin(angle))


def pair_curve_points(
    x0: float,
    x1: float,
    *,
    pair_radius: float,
    turns: float,
    phase: float,
    points: int = 170,
) -> list[tuple[float, float, float]]:
    path: list[tuple[float, float, float]] = []
    for step in range(points):
        t = step / (points - 1)
        x = x0 + (x1 - x0) * t
        path.append(pair_point(x, t, pair_radius=pair_radius, turns=turns, phase=phase))
    return path


def pair_curve_with_straight_tail(
    x0: float,
    x1: float,
    tail_x1: float,
    *,
    pair_radius: float,
    turns: float,
    phase: float,
    points: int = 170,
    tail_points: int = 18,
) -> list[tuple[float, float, float]]:
    path = pair_curve_points(x0, x1, pair_radius=pair_radius, turns=turns, phase=phase, points=points)
    end_x, end_y, end_z = path[-1]
    for step in range(1, tail_points + 1):
        u = step / tail_points
        path.append((end_x + (tail_x1 - end_x) * u, end_y, end_z))
    return path


def add_pair_tail(
    objects: list[bpy.types.Object],
    *,
    label: str,
    start: tuple[float, float, float],
    length: float,
    mat: bpy.types.Material,
    bevel_depth: float,
    strand_count: int = 7,
) -> None:
    x, y, z = start
    for strand in range(strand_count):
        phase = math.tau * strand / strand_count
        offset = bevel_depth * 1.45
        path = [
            (x, y + offset * math.cos(phase), z + offset * math.sin(phase)),
            (x + length, y + offset * math.cos(phase), z + offset * math.sin(phase)),
        ]
        objects.append(curve_from_points(f"{label}_exposed_strand_{strand + 1:02d}", path, mat, bevel_depth=bevel_depth * 0.34))


def elliptical_tube_sector_x(
    name: str,
    x0: float,
    x1: float,
    inner_y: float,
    inner_z: float,
    outer_y: float,
    outer_z: float,
    start_angle: float,
    end_angle: float,
    mat: bpy.types.Material,
    *,
    angular_segments: int = 96,
    length_segments: int = 76,
    texture_wobble: float = 0,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for ix in range(length_segments + 1):
        t = ix / length_segments
        x = x0 + (x1 - x0) * t
        wobble = texture_wobble * math.sin(t * math.tau * 5.0)
        for ia in range(angular_segments + 1):
            u = ia / angular_segments
            angle = start_angle + (end_angle - start_angle) * u
            cy = math.cos(angle)
            sz = math.sin(angle)
            verts.append((x, (outer_y + wobble) * cy, (outer_z + wobble * 0.45) * sz))
            verts.append((x, (inner_y + wobble * 0.75) * cy, (inner_z + wobble * 0.35) * sz))

    row_width = (angular_segments + 1) * 2
    for ix in range(length_segments):
        row = ix * row_width
        next_row = (ix + 1) * row_width
        for ia in range(angular_segments):
            o0 = row + ia * 2
            i0 = o0 + 1
            o1 = row + (ia + 1) * 2
            i1 = o1 + 1
            o0n = next_row + ia * 2
            i0n = o0n + 1
            o1n = next_row + (ia + 1) * 2
            i1n = o1n + 1
            faces.append([o0, o1, o1n, o0n])
            faces.append([i1, i0, i0n, i1n])
    for ix in range(length_segments):
        row = ix * row_width
        next_row = (ix + 1) * row_width
        for ia in (0, angular_segments):
            o0 = row + ia * 2
            i0 = o0 + 1
            o1 = next_row + ia * 2
            i1 = o1 + 1
            faces.append([o0, o1, i1, i0])

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return smooth_obj(obj)


def helical_ribbon_ellipse(
    name: str,
    x0: float,
    x1: float,
    y_radius: float,
    z_radius: float,
    turns: float,
    width_angle: float,
    mat: bpy.types.Material,
    *,
    phase: float = 0,
    handedness: int = 1,
    segments: int = 160,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for step in range(segments + 1):
        t = step / segments
        x = x0 + (x1 - x0) * t
        center = phase + handedness * turns * math.tau * t
        for edge in (-0.5, 0.5):
            angle = center + edge * width_angle
            verts.append((x, y_radius * math.cos(angle), z_radius * math.sin(angle)))
    for step in range(segments):
        row = step * 2
        faces.append([row, row + 1, row + 3, row + 2])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return smooth_obj(obj)


def add_pair_field_lines(
    objects: list[bpy.types.Object],
    mat_a: bpy.types.Material,
    mat_b: bpy.types.Material,
    *,
    x0: float,
    x1: float,
    pair_radius: float,
    turns: float,
) -> None:
    for index in range(13):
        t = (index + 0.5) / 14
        x = x0 + (x1 - x0) * t
        a = pair_point(x, t, pair_radius=pair_radius, turns=turns, phase=0)
        b = pair_point(x, t, pair_radius=pair_radius, turns=turns, phase=math.pi)
        mat = mat_a if index % 2 == 0 else mat_b
        path: list[tuple[float, float, float]] = []
        for step in range(16):
            u = step / 15
            bow = math.sin(u * math.pi) * 0.065
            y = a[1] * (1 - u) + b[1] * u
            z = a[2] * (1 - u) + b[2] * u + bow
            path.append((x + 0.035 * math.sin(u * math.pi), y, z))
        objects.append(curve_from_points(f"Differential_Dielectric_Field_Line_{index + 1:02d}", path, mat, bevel_depth=0.0048))


def add_highspeed_pair(objects: list[bpy.types.Object], mats: dict[str, bpy.types.Material]) -> None:
    pair_radius = 0.165
    turns = 4.6
    x0 = -4.0
    x1 = 3.45
    copper_x1 = 4.35
    insulation_radius = 0.108
    conductor_radius = 0.046

    for label, phase, insulation_mat in (
        ("Blue_Positive", 0.0, mats["insulation_blue"]),
        ("White_Negative", math.pi, mats["insulation_white"]),
    ):
        objects.append(
            curve_from_points(
                f"{label}_LowLoss_Insulation_Tube",
                pair_curve_points(x0, x1, pair_radius=pair_radius, turns=turns, phase=phase, points=190),
                insulation_mat,
                bevel_depth=insulation_radius,
            )
        )
        objects.append(
            curve_from_points(
                f"{label}_Copper_Conductor_Core",
                pair_curve_with_straight_tail(
                    x0,
                    x1,
                    copper_x1,
                    pair_radius=pair_radius,
                    turns=turns,
                    phase=phase,
                    points=190,
                    tail_points=26,
                ),
                mats["copper"],
                bevel_depth=conductor_radius,
            )
        )
        objects.append(
            curve_from_points(
                f"Skin_Heat_Trace_{label}",
                pair_curve_points(-3.7, 3.6, pair_radius=pair_radius + 0.006, turns=turns, phase=phase + 0.16, points=160),
                mats["heat"],
                bevel_depth=0.006,
            )
        )

    add_pair_field_lines(objects, mats["field_a"], mats["field_b"], x0=-3.2, x1=2.9, pair_radius=pair_radius, turns=turns)


def build_scene() -> None:
    reset_scene()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    set_render_settings()

    copper = make_material("Polished_Copper_Physical", (0.95, 0.38, 0.08, 1), metallic=1, roughness=0.18)
    copper_hi = make_material("Copper_Anisotropic_Highlight", (1.0, 0.73, 0.34, 1), metallic=1, roughness=0.12)
    heat = make_material("Skin_Loss_Heat_Emission", (1.0, 0.44, 0.02, 1), metallic=0, roughness=0.2, alpha=0.78)
    set_emission(heat, (1.0, 0.34, 0.04, 1), 2.2)
    insulation_blue = make_material("Blue_LowLoss_Insulation_Dielectric", (0.40, 0.78, 1.0, 1), metallic=0, roughness=0.30, alpha=0.58)
    insulation_white = make_material("White_LowLoss_Insulation_Dielectric", (0.98, 0.94, 0.84, 1), metallic=0, roughness=0.32, alpha=0.68)
    foil = make_material("Pair_Foil_Shield_Silver_Ghost", (0.80, 0.82, 0.78, 1), metallic=1, roughness=0.13, alpha=0.36)
    foil_edge = make_material("Pair_Foil_Tape_Edge", (0.95, 0.86, 0.48, 1), metallic=1, roughness=0.12, alpha=0.42)
    jacket = make_material("Matte_Black_Twinax_Jacket", (0.010, 0.012, 0.012, 1), metallic=0, roughness=0.80)
    jacket_edge = make_material("Cut_Jacket_Dark_Edge", (0.045, 0.042, 0.038, 1), metallic=0, roughness=0.70)
    scuff = make_material("Jacket_Micro_Scuffs", (0.18, 0.20, 0.20, 1), metallic=0, roughness=0.86, alpha=0.42)
    field_a = make_material("Dielectric_Field_Cyan", (0.25, 1.0, 0.9, 1), metallic=0, roughness=0.2, alpha=0.46)
    field_b = make_material("Dielectric_Field_Gold", (1.0, 0.78, 0.18, 1), metallic=0, roughness=0.2, alpha=0.36)
    set_emission(field_a, (0.15, 0.9, 0.84, 1), 1.1)
    set_emission(field_b, (1.0, 0.62, 0.12, 1), 0.9)

    keep_start = math.radians(-68)
    keep_end = math.radians(68)
    objects: list[bpy.types.Object] = []

    add_highspeed_pair(
        objects,
        {
            "copper": copper,
            "copper_hi": copper_hi,
            "heat": heat,
            "insulation_blue": insulation_blue,
            "insulation_white": insulation_white,
            "field_a": field_a,
            "field_b": field_b,
        },
    )

    objects.append(elliptical_tube_sector_x("Pair_Foil_Shield_Cutaway", -3.65, 3.55, 0.43, 0.255, 0.49, 0.315, keep_start, keep_end, foil, angular_segments=110, length_segments=92, texture_wobble=0.002))
    objects.append(helical_ribbon_ellipse("Pair_Foil_Tape_Spiral_01", -3.45, 3.55, 0.505, 0.326, 7.8, math.radians(22), foil_edge, phase=math.radians(25), handedness=1))
    objects.append(helical_ribbon_ellipse("Pair_Foil_Tape_Spiral_02", -3.25, 3.45, 0.512, 0.332, 7.8, math.radians(14), foil, phase=math.radians(188), handedness=1))
    objects.append(elliptical_tube_sector_x("Matte_Black_Twinax_Jacket_Left_Sleeve", -4.25, -1.58, 0.53, 0.34, 0.72, 0.47, 0, math.tau, jacket, angular_segments=128, length_segments=44, texture_wobble=0.004))
    objects.append(elliptical_tube_sector_x("Matte_Black_Twinax_Jacket_Cutaway_Window", -1.72, 3.50, 0.53, 0.34, 0.72, 0.47, keep_start, keep_end, jacket, angular_segments=128, length_segments=88, texture_wobble=0.003))
    objects.append(elliptical_tube_sector_x("Jacket_Cut_Edge_Ring", -1.76, -1.50, 0.53, 0.34, 0.73, 0.48, 0, math.tau, jacket_edge, angular_segments=128, length_segments=4))

    for index in range(18):
        phase = math.radians(168 + (index % 6) * 9)
        y_scale = 0.725
        z_scale = 0.475
        x_base = -4.05 + (index // 6) * 0.36
        path = []
        for step in range(16):
            t = step / 15
            x = x_base + 1.05 * t
            angle = phase + 0.035 * math.sin(t * math.tau + index)
            path.append((x, y_scale * math.cos(angle), z_scale * math.sin(angle)))
        objects.append(curve_from_points(f"Twinax_Jacket_Surface_Scuff_{index + 1:02d}", path, scuff, bevel_depth=0.0022, resolution=1))

    root = bpy.data.objects.new("Highspeed_Attenuation_Macro_Root", None)
    bpy.context.collection.objects.link(root)
    for obj in objects:
        obj.parent = root

    bpy.ops.object.light_add(type="AREA", location=(0.2, -4.6, 4.2))
    key = bpy.context.object
    key.name = "Large_Softbox_Key"
    key.data.energy = 620
    key.data.size = 5.2
    bpy.ops.object.light_add(type="POINT", location=(3.6, -2.0, 1.5))
    rim = bpy.context.object
    rim.name = "Warm_Copper_Rim"
    rim.data.energy = 90
    rim.data.color = (1.0, 0.58, 0.22)

    bpy.ops.object.camera_add(location=(4.8, -5.0, 2.35), rotation=(math.radians(63), 0, math.radians(43)))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.name = "Camera_Macro_ThreeQuarter"
    camera.data.lens = 54
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 6.1
    camera.data.dof.aperture_fstop = 6.5

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=True,
    )
    print(f"Wrote {GLB_PATH}")
    print(f"Wrote {PREVIEW_PATH}")


if __name__ == "__main__":
    build_scene()
