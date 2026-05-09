from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "public" / "models"


MODELS = [
    {
        "name": "AVA5-50",
        "slug": "rf-ava5-50",
        "family": "ava_hardline",
        "outer_r": 0.92,
        "shield_r": 0.72,
        "dielectric_r": 0.46,
        "conductor_r": 0.12,
        "corrugation_amp": 0.045,
        "corrugation_count": 18,
        "jacket_color": (0.012, 0.013, 0.012, 1),
    },
    {
        "name": "AVA7-50",
        "slug": "rf-ava7-50",
        "family": "ava_hardline",
        "outer_r": 1.18,
        "shield_r": 0.94,
        "dielectric_r": 0.61,
        "conductor_r": 0.17,
        "corrugation_amp": 0.065,
        "corrugation_count": 14,
        "jacket_color": (0.006, 0.008, 0.008, 1),
    },
    {
        "name": "RG-58/U",
        "slug": "rf-rg58",
        "family": "video_coax",
        "d_mm": 0.91,
        "dielectric_mm": 2.95,
        "shield_mm": 3.60,
        "od_mm": 4.95,
        "braid_carriers": 16,
        "braid_turns": 5.85,
        "foil": False,
        "conductor_strands": 19,
        "conductor_material": "tinned_copper",
        "dielectric_material": "solid_pe",
        "braid_material": "tinned_copper",
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "RG-174/U",
        "slug": "rf-rg174",
        "family": "video_coax",
        "d_mm": 0.48,
        "dielectric_mm": 1.52,
        "shield_mm": 1.90,
        "od_mm": 2.79,
        "braid_carriers": 12,
        "braid_turns": 6.40,
        "foil": False,
        "conductor_strands": 7,
        "conductor_material": "tinned_copper",
        "dielectric_material": "solid_pe",
        "braid_material": "tinned_copper",
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "RG-178B/U",
        "slug": "rf-rg178",
        "family": "video_coax",
        "d_mm": 0.31,
        "dielectric_mm": 0.84,
        "shield_mm": 1.22,
        "od_mm": 1.83,
        "braid_carriers": 12,
        "braid_turns": 6.75,
        "foil": False,
        "conductor_strands": 7,
        "conductor_material": "silver",
        "dielectric_material": "ptfe",
        "braid_material": "silver",
        "jacket_color": (0.34, 0.20, 0.12, 1),
    },
    {
        "name": "RG-213/U",
        "slug": "rf-rg213",
        "family": "video_coax",
        "d_mm": 2.26,
        "dielectric_mm": 7.24,
        "shield_mm": 8.23,
        "od_mm": 10.29,
        "braid_carriers": 20,
        "braid_turns": 4.45,
        "foil": False,
        "conductor_strands": 7,
        "conductor_material": "bare_copper",
        "dielectric_material": "solid_pe",
        "braid_material": "bare_copper",
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "RG-214/U",
        "slug": "rf-rg214",
        "family": "video_coax",
        "d_mm": 2.26,
        "dielectric_mm": 7.24,
        "shield_mm": 9.14,
        "od_mm": 10.80,
        "braid_carriers": 20,
        "braid_turns": 4.35,
        "foil": False,
        "double_braid": True,
        "conductor_strands": 7,
        "conductor_material": "silver",
        "dielectric_material": "solid_pe",
        "braid_material": "silver",
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "RG-223/U",
        "slug": "rf-rg223",
        "family": "video_coax",
        "d_mm": 0.89,
        "dielectric_mm": 2.95,
        "shield_mm": 4.00,
        "od_mm": 5.38,
        "braid_carriers": 18,
        "braid_turns": 5.70,
        "foil": False,
        "double_braid": True,
        "conductor_strands": 1,
        "conductor_material": "silver",
        "dielectric_material": "solid_pe",
        "braid_material": "silver",
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "RG-316/U",
        "slug": "rf-rg316",
        "family": "video_coax",
        "d_mm": 0.51,
        "dielectric_mm": 1.52,
        "shield_mm": 1.94,
        "od_mm": 2.49,
        "braid_carriers": 14,
        "braid_turns": 6.20,
        "foil": False,
        "conductor_strands": 7,
        "conductor_material": "silver",
        "dielectric_material": "ptfe",
        "braid_material": "silver",
        "jacket_color": (0.36, 0.22, 0.13, 1),
    },
    {
        "name": "RG-400/U",
        "slug": "rf-rg400",
        "family": "video_coax",
        "d_mm": 0.94,
        "dielectric_mm": 2.95,
        "shield_mm": 3.56,
        "od_mm": 4.95,
        "braid_carriers": 18,
        "braid_turns": 5.65,
        "foil": False,
        "double_braid": True,
        "conductor_strands": 19,
        "conductor_material": "silver",
        "dielectric_material": "ptfe",
        "braid_material": "silver",
        "jacket_color": (0.52, 0.40, 0.27, 1),
    },
    {
        "name": "RG-8X (Mini-8)",
        "slug": "rf-rg8x",
        "family": "video_coax",
        "d_mm": 1.02,
        "dielectric_mm": 2.95,
        "shield_mm": 3.56,
        "od_mm": 6.10,
        "braid_carriers": 16,
        "braid_turns": 5.45,
        "foil": False,
        "conductor_strands": 19,
        "conductor_material": "bare_copper",
        "dielectric_material": "foam_pe",
        "braid_material": "tinned_copper",
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "RG-142B/U",
        "slug": "rf-rg142",
        "family": "video_coax",
        "d_mm": 0.94,
        "dielectric_mm": 2.95,
        "shield_mm": 3.30,
        "od_mm": 4.95,
        "braid_carriers": 18,
        "braid_turns": 5.70,
        "foil": False,
        "double_braid": True,
        "conductor_strands": 19,
        "conductor_material": "silver",
        "dielectric_material": "ptfe",
        "braid_material": "silver",
        "jacket_color": (0.52, 0.40, 0.27, 1),
    },
    {
        "name": "Belden 1505A",
        "slug": "rf-belden1505a",
        "family": "video_coax",
        "d_mm": 1.02,
        "dielectric_mm": 4.80,
        "shield_mm": 5.60,
        "od_mm": 6.15,
        "braid_carriers": 18,
        "braid_turns": 5.35,
        "jacket_color": (0.010, 0.010, 0.009, 1),
    },
    {
        "name": "Belden 1694A",
        "slug": "rf-belden1694a",
        "family": "video_coax",
        "d_mm": 1.02,
        "dielectric_mm": 4.60,
        "shield_mm": 5.46,
        "od_mm": 6.99,
        "braid_carriers": 18,
        "braid_turns": 5.10,
        "jacket_color": (0.011, 0.011, 0.010, 1),
    },
    {
        "name": "Belden 1855A",
        "slug": "rf-belden1855a",
        "family": "video_coax",
        "d_mm": 0.47,
        "dielectric_mm": 2.32,
        "shield_mm": 2.80,
        "od_mm": 3.70,
        "braid_carriers": 14,
        "braid_turns": 5.80,
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "Belden 4694R",
        "slug": "rf-belden4694r",
        "family": "video_coax",
        "d_mm": 1.02,
        "dielectric_mm": 4.80,
        "shield_mm": 5.60,
        "od_mm": 7.70,
        "braid_carriers": 20,
        "braid_turns": 4.90,
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "Belden 9913",
        "slug": "rf-belden9913",
        "family": "video_coax",
        "d_mm": 2.74,
        "dielectric_mm": 7.24,
        "shield_mm": 8.13,
        "od_mm": 10.29,
        "braid_carriers": 20,
        "braid_turns": 4.35,
        "jacket_color": (0.008, 0.009, 0.008, 1),
    },
    {
        "name": "Belden 9913F",
        "slug": "rf-belden9913f",
        "family": "video_coax",
        "d_mm": 2.84,
        "dielectric_mm": 7.24,
        "shield_mm": 8.13,
        "od_mm": 10.29,
        "braid_carriers": 20,
        "braid_turns": 4.55,
        "jacket_color": (0.008, 0.009, 0.008, 1),
    },
    {
        "name": "Canare L-4CFB",
        "slug": "rf-canare-l4cfb",
        "family": "video_coax",
        "d_mm": 0.65,
        "dielectric_mm": 2.80,
        "shield_mm": 3.30,
        "od_mm": 4.50,
        "braid_carriers": 14,
        "braid_turns": 5.60,
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
    {
        "name": "Canare L-5CFB",
        "slug": "rf-canare-l5cfb",
        "family": "video_coax",
        "d_mm": 1.02,
        "dielectric_mm": 4.80,
        "shield_mm": 5.60,
        "od_mm": 7.70,
        "braid_carriers": 18,
        "braid_turns": 5.05,
        "jacket_color": (0.010, 0.010, 0.010, 1),
    },
]


def ensure_dirs() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0,
    roughness: float = 0.4,
    alpha: float = 1,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (color[0], color[1], color[2], alpha)
    mat.use_backface_culling = False
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], alpha)
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
    return mat


def cylinder_x(
    name: str,
    x: float,
    length: float,
    radius: float,
    mat: bpy.types.Material,
    *,
    vertices: int = 96,
    loc_y: float = 0,
    loc_z: float = 0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=(x, loc_y, loc_z),
        rotation=(0, math.radians(90), 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def tube_surface(
    name: str,
    x0: float,
    x1: float,
    radius: float,
    mat: bpy.types.Material,
    *,
    corrugation_amp: float = 0,
    corrugation_count: float = 1,
    radial_segments: int = 96,
    length_segments: int = 96,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for i in range(length_segments + 1):
        t = i / length_segments
        x = x0 + (x1 - x0) * t
        r = radius + corrugation_amp * math.sin(t * corrugation_count * math.tau)
        for j in range(radial_segments):
            a = j * math.tau / radial_segments
            verts.append((x, r * math.cos(a), r * math.sin(a)))
    for i in range(length_segments):
        row = i * radial_segments
        next_row = (i + 1) * radial_segments
        for j in range(radial_segments):
            faces.append([row + j, row + (j + 1) % radial_segments, next_row + (j + 1) % radial_segments, next_row + j])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def helical_rib(
    name: str,
    x0: float,
    x1: float,
    radius: float,
    turns: float,
    phase: float,
    mat: bpy.types.Material,
    *,
    bevel_depth: float,
    handedness: int = 1,
    points: int = 160,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(points - 1)
    for i, point in enumerate(spline.points):
        t = i / (points - 1)
        x = x0 + (x1 - x0) * t
        a = phase + handedness * turns * math.tau * t
        point.co = (x, radius * math.cos(a), radius * math.sin(a), 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def helical_ribbon(
    name: str,
    x0: float,
    x1: float,
    radius: float,
    turns: float,
    phase: float,
    width_angle: float,
    mat: bpy.types.Material,
    *,
    handedness: int = 1,
    segments: int = 192,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for i in range(segments + 1):
        t = i / segments
        x = x0 + (x1 - x0) * t
        center_angle = phase + handedness * turns * math.tau * t
        for edge in (-0.5, 0.5):
            a = center_angle + edge * width_angle
            verts.append((x, radius * math.cos(a), radius * math.sin(a)))
    for i in range(segments):
        row = i * 2
        faces.append([row, row + 1, row + 3, row + 2])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def conductor_offsets(strands: int, radius: float) -> tuple[float, list[tuple[float, float]]]:
    if strands >= 19:
        strand_r = radius * 0.155
        offsets = [(0, 0)]
        offsets.extend(
            (radius * 0.34 * math.cos(i * math.tau / 6), radius * 0.34 * math.sin(i * math.tau / 6))
            for i in range(6)
        )
        offsets.extend(
            (radius * 0.67 * math.cos(i * math.tau / 12), radius * 0.67 * math.sin(i * math.tau / 12))
            for i in range(12)
        )
        return strand_r, offsets
    if strands >= 7:
        strand_r = radius * 0.24
        offsets = [(0, 0)]
        offsets.extend(
            (radius * 0.50 * math.cos(i * math.tau / 6), radius * 0.50 * math.sin(i * math.tau / 6))
            for i in range(6)
        )
        return strand_r, offsets
    return radius, [(0, 0)]


def add_center_conductor(
    x0: float,
    x1: float,
    radius: float,
    copper: bpy.types.Material,
    *,
    strands: int = 1,
) -> list[bpy.types.Object]:
    if strands <= 1:
        return [
            cylinder_x(
                "solid center conductor continuous",
                (x0 + x1) / 2,
                x1 - x0,
                radius,
                copper,
                vertices=96,
            )
        ]

    strand_r, offsets = conductor_offsets(strands, radius)
    objects: list[bpy.types.Object] = []
    for idx, (y, z) in enumerate(offsets, start=1):
        objects.append(
            cylinder_x(
                f"{strands} strand center conductor {idx:02d}",
                (x0 + x1) / 2,
                x1 - x0,
                strand_r,
                copper,
                vertices=32,
                loc_y=y,
                loc_z=z,
            )
        )
    return objects


def conductor_material_color(kind: str) -> tuple[float, float, float, float]:
    return {
        "bare_copper": (0.92, 0.42, 0.15, 1),
        "tinned_copper": (0.78, 0.74, 0.66, 1),
        "silver": (0.95, 0.94, 0.88, 1),
    }.get(kind, (0.92, 0.42, 0.15, 1))


def braid_material_color(kind: str) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    palettes = {
        "bare_copper": ((0.82, 0.42, 0.16, 1), (0.30, 0.14, 0.07, 1)),
        "silver": ((0.86, 0.86, 0.80, 1), (0.34, 0.34, 0.31, 1)),
        "tinned_copper": ((0.76, 0.77, 0.72, 1), (0.24, 0.25, 0.24, 1)),
    }
    return palettes.get(kind, palettes["tinned_copper"])


def dielectric_material_color(kind: str) -> tuple[str, tuple[float, float, float, float], float]:
    palettes = {
        "foam_pe": ("gas injected foam pe", (0.88, 0.86, 0.76, 1), 0.78),
        "solid_pe": ("solid polyethylene dielectric", (0.86, 0.84, 0.72, 1), 0.86),
        "ptfe": ("solid ptfe dielectric", (0.96, 0.94, 0.86, 1), 0.90),
    }
    return palettes.get(kind, palettes["foam_pe"])


def add_label_empty(name: str) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.2
    bpy.context.collection.objects.link(root)
    return root


def build_ava_hardline_model(spec: dict) -> None:
    reset_scene()
    root = add_label_empty(f"{spec['name']} runtime GLB root")

    copper = make_material("copper conductor", (0.9, 0.43, 0.16, 1), metallic=0.78, roughness=0.22)
    corrugated_copper = make_material("corrugated copper outer conductor", (0.78, 0.39, 0.16, 1), metallic=0.86, roughness=0.2)
    copper_shadow = make_material("dark copper groove shading", (0.34, 0.16, 0.08, 1), metallic=0.75, roughness=0.3)
    foam = make_material("low density foam dielectric", (0.9, 0.87, 0.75, 1), roughness=0.36, alpha=0.72)
    tape = make_material("ptfe tape spiral wrap", (0.98, 0.96, 0.86, 1), roughness=0.28, alpha=0.44)
    tape_edge = make_material("ptfe tape lap edge", (1.0, 0.98, 0.9, 1), roughness=0.24, alpha=0.68)
    jacket = make_material("black outdoor PE jacket", spec["jacket_color"], roughness=0.82)

    objects: list[bpy.types.Object] = []
    objects.append(cylinder_x("black PE jacket body", -1.72, 3.18, spec["outer_r"], jacket, vertices=128))
    objects.append(cylinder_x("jacket cut lip", -0.12, 0.12, spec["outer_r"] * 1.015, jacket, vertices=128))
    objects.append(
        tube_surface(
            "corrugated copper shield",
            -0.32,
            1.42,
            spec["shield_r"],
            corrugated_copper,
            corrugation_amp=spec["corrugation_amp"],
            corrugation_count=spec["corrugation_count"],
        )
    )
    objects.append(
        tube_surface(
            "dark groove shadow pass",
            -0.28,
            1.38,
            spec["shield_r"] - spec["corrugation_amp"] * 0.65,
            copper_shadow,
            corrugation_amp=spec["corrugation_amp"] * 0.22,
            corrugation_count=spec["corrugation_count"],
            radial_segments=72,
            length_segments=72,
        )
    )
    objects.append(cylinder_x("foam PE dielectric", 1.78, 1.42, spec["dielectric_r"], foam, vertices=128))
    tape_radius = spec["dielectric_r"] * 1.018
    objects.append(
        helical_ribbon(
            "surface PTFE tape wrap",
            1.08,
            2.52,
            tape_radius,
            1.18,
            math.radians(22),
            math.radians(86),
            tape,
        )
    )
    objects.append(
        helical_rib(
            "subtle PTFE tape lap line",
            1.08,
            2.52,
            tape_radius * 1.006,
            1.18,
            math.radians(65),
            tape_edge,
            bevel_depth=spec["dielectric_r"] * 0.0065,
            points=180,
        )
    )
    objects.extend(add_center_conductor(0.22, 3.34, spec["conductor_r"], copper))

    for obj in objects:
        obj.parent = root

    root.rotation_euler = (math.radians(-7), 0, math.radians(-2))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *objects]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.export_scene.gltf(
        filepath=str(MODELS_DIR / f"{spec['slug']}.glb"),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_current_frame=True,
    )


def build_video_coax_model(spec: dict) -> None:
    reset_scene()
    root = add_label_empty(f"{spec['name']} runtime GLB root")

    scale = 0.25
    outer_r = spec["od_mm"] * 0.5 * scale
    braid_r = spec["shield_mm"] * 0.5 * scale
    foil_r = braid_r * 0.965
    dielectric_r = spec["dielectric_mm"] * 0.5 * scale
    conductor_r = spec["d_mm"] * 0.5 * scale

    conductor_kind = spec.get("conductor_material", "bare_copper")
    dielectric_kind = spec.get("dielectric_material", "foam_pe")
    braid_kind = spec.get("braid_material", "tinned_copper")
    dielectric_name, dielectric_color, dielectric_alpha = dielectric_material_color(dielectric_kind)
    braid_color, braid_shadow_color = braid_material_color(braid_kind)

    copper = make_material(f"{conductor_kind.replace('_', ' ')} center conductor", conductor_material_color(conductor_kind), metallic=0.78, roughness=0.2)
    foam = make_material(dielectric_name, dielectric_color, roughness=0.42, alpha=dielectric_alpha)
    foam_skin = make_material("foam skin highlight", (0.98, 0.95, 0.82, 1), roughness=0.34, alpha=0.34)
    foil = make_material("duobond aluminum foil", (0.88, 0.89, 0.84, 1), metallic=0.38, roughness=0.34)
    foil_edge = make_material("foil lap edge", (0.98, 0.98, 0.92, 1), metallic=0.32, roughness=0.28)
    braid = make_material(f"{braid_kind.replace('_', ' ')} braid", braid_color, metallic=0.84, roughness=0.22)
    braid_shadow = make_material("braid shadow pass", braid_shadow_color, metallic=0.55, roughness=0.4, alpha=0.46)
    inner_braid = make_material(f"inner {braid_kind.replace('_', ' ')} braid", tuple(min(c * 1.08, 1) for c in braid_color[:3]) + (1,), metallic=0.78, roughness=0.27)
    jacket = make_material("matte black pvc jacket", spec["jacket_color"], roughness=0.86)
    jacket_edge = make_material("fresh jacket cut edge", (0.018, 0.017, 0.015, 1), roughness=0.74)

    objects: list[bpy.types.Object] = []
    has_foil = spec.get("foil", True)
    double_braid = spec.get("double_braid", False)
    braid_start = -0.28
    braid_end = spec.get("braid_end", 1.34 if has_foil else (1.22 if double_braid else 1.52))
    inner_braid_end = spec.get("inner_braid_end", 1.62 if double_braid else braid_end)
    foil_end = spec.get("foil_end", 1.86)
    objects.append(cylinder_x("matte black pvc jacket body", -1.70, 3.04, outer_r, jacket, vertices=128))
    objects.append(cylinder_x("jacket cut lip", -0.16, 0.16, outer_r * 1.01, jacket_edge, vertices=128))
    if has_foil:
        objects.append(
            tube_surface(
                "duobond foil sleeve",
                braid_start,
                foil_end,
                foil_r,
                foil,
                radial_segments=112,
                length_segments=64,
            )
        )
        objects.append(
            helical_ribbon(
                "subtle foil wrap lap",
                braid_start + 0.1,
                foil_end,
                foil_r * 1.012,
                1.34,
                math.radians(18),
                math.radians(72),
                foil_edge,
                segments=140,
            )
        )

    carriers = spec["braid_carriers"]
    turns = spec["braid_turns"]
    braid_depth = max(0.0045, outer_r * 0.0065)
    def add_braid_layer(label: str, radius: float, x_end: float, turns_value: float, material: bpy.types.Material, shadow: bpy.types.Material, phase_offset: float = 0) -> None:
        for i in range(carriers):
            phase = phase_offset + math.tau * i / carriers
            objects.append(
                helical_rib(
                    f"{label} right hand carrier {i + 1:02d}",
                    braid_start,
                    x_end,
                    radius,
                    turns_value,
                    phase,
                    material,
                    bevel_depth=braid_depth,
                    handedness=1,
                    points=118,
                )
            )
            objects.append(
                helical_rib(
                    f"{label} left hand carrier {i + 1:02d}",
                    braid_start,
                    x_end,
                    radius * 1.006,
                    turns_value,
                    phase + math.tau / (carriers * 2),
                    shadow if i % 3 == 0 else material,
                    bevel_depth=braid_depth * (0.85 if i % 3 == 0 else 1.0),
                    handedness=-1,
                    points=118,
                )
            )

    if double_braid:
        add_braid_layer("inner braid", braid_r * 0.93, inner_braid_end, turns * 0.92, inner_braid, braid_shadow, phase_offset=math.tau / (carriers * 4))
    add_braid_layer("braid", braid_r, braid_end, turns, braid, braid_shadow)

    objects.append(cylinder_x("gas injected foam dielectric", 1.95, 1.58, dielectric_r, foam, vertices=128))
    objects.append(
        tube_surface(
            "smooth dielectric skin",
            1.15,
            2.73,
            dielectric_r * 1.012,
            foam_skin,
            radial_segments=112,
            length_segments=36,
        )
    )
    objects.extend(add_center_conductor(0.18, 3.28, conductor_r, copper, strands=spec.get("conductor_strands", 1)))

    for obj in objects:
        obj.parent = root

    root.rotation_euler = (math.radians(-6), 0, math.radians(-2.5))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root, *objects]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.export_scene.gltf(
        filepath=str(MODELS_DIR / f"{spec['slug']}.glb"),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_current_frame=True,
    )


def build_model(spec: dict) -> None:
    family = spec.get("family", "ava_hardline")
    if family == "video_coax":
        build_video_coax_model(spec)
    else:
        build_ava_hardline_model(spec)


def main() -> None:
    ensure_dirs()
    for spec in MODELS:
        build_model(spec)


if __name__ == "__main__":
    main()
