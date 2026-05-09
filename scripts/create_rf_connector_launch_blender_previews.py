from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RENDERS_DIR = ROOT / "public" / "cable-renders"
MODELS_DIR = ROOT / "public" / "models"
BLEND_PATH = MODELS_DIR / "rf-connector-launch-lab.blend"

LENGTH = 6.4

CASES = [
    {
        "id": "golden",
        "output": "rf-launch-golden.png",
        "accent": (0.34, 0.96, 0.86),
        "tone": "golden launch",
    },
    {
        "id": "pin-plane",
        "output": "rf-launch-pin-plane.png",
        "accent": (0.22, 0.74, 1.0),
        "tone": "pin plane offset",
    },
    {
        "id": "strip-length",
        "output": "rf-launch-strip-length.png",
        "accent": (1.0, 0.72, 0.14),
        "tone": "strip length error",
    },
    {
        "id": "dielectric-gap",
        "output": "rf-launch-dielectric-gap.png",
        "accent": (0.34, 0.96, 0.86),
        "tone": "dielectric air gap",
    },
    {
        "id": "ferrule-step",
        "output": "rf-launch-ferrule-step.png",
        "accent": (1.0, 0.48, 0.16),
        "tone": "ferrule shoulder step",
    },
    {
        "id": "crimp-ovality",
        "output": "rf-launch-crimp-ovality.png",
        "accent": (1.0, 0.32, 0.45),
        "tone": "oval crimp",
    },
]


def ensure_dirs() -> None:
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for datablock in (bpy.data.curves, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 760
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if hasattr(scene, "eevee"):
        eevee = scene.eevee
        for attr, value in (
            ("use_gtao", True),
            ("gtao_distance", 3.2),
            ("gtao_factor", 1.55),
            ("use_bloom", True),
            ("bloom_intensity", 0.045),
        ):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.world = scene.world or bpy.data.worlds.new("RF_Connector_Launch_World")
    scene.world.color = (0.010, 0.012, 0.014)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0,
    roughness: float = 0.45,
    alpha: float = 1,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (color[0], color[1], color[2], alpha)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        def set_input(label: str, value) -> None:
            if label in bsdf.inputs:
                bsdf.inputs[label].default_value = value

        set_input("Base Color", (color[0], color[1], color[2], alpha))
        set_input("Metallic", metallic)
        set_input("Roughness", roughness)
        set_input("Alpha", alpha)
        if emission:
            set_input("Emission Color", (emission[0], emission[1], emission[2], 1))
            set_input("Emission Strength", emission_strength)
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
        if hasattr(mat, "use_screen_refraction"):
            mat.use_screen_refraction = True
    return mat


def make_materials(case: dict) -> dict[str, bpy.types.Material]:
    accent = case["accent"]
    return {
        "floor": make_material("matte_graphite_floor", (0.020, 0.024, 0.026, 1), roughness=0.78),
        "jacket": make_material("black_jacket_cutaway", (0.014, 0.020, 0.022, 1), roughness=0.74, alpha=0.92),
        "dielectric": make_material("ptfe_dielectric", (0.86, 0.82, 0.68, 1), roughness=0.45, alpha=0.58),
        "dielectric_face": make_material("ptfe_polished_face", (0.96, 0.93, 0.78, 1), roughness=0.32, alpha=0.86),
        "copper": make_material("copper_center", (0.95, 0.43, 0.16, 1), metallic=0.85, roughness=0.22),
        "gold": make_material("gold_plated_pin", (1.0, 0.66, 0.20, 1), metallic=0.9, roughness=0.16),
        "foil": make_material("thin_foil", (0.78, 0.82, 0.80, 1), metallic=0.7, roughness=0.24, alpha=0.48),
        "braid_a": make_material("tin_braid", (0.78, 0.78, 0.72, 1), metallic=0.8, roughness=0.28),
        "braid_b": make_material("warm_braid", (0.94, 0.56, 0.25, 1), metallic=0.72, roughness=0.25),
        "shell": make_material("connector_shell", (0.54, 0.58, 0.56, 1), metallic=0.92, roughness=0.22),
        "shell_dark": make_material("connector_shadow_metal", (0.16, 0.18, 0.18, 1), metallic=0.78, roughness=0.26),
        "accent": make_material("launch_accent", (accent[0], accent[1], accent[2], 1), roughness=0.2, alpha=0.74, emission=accent, emission_strength=1.35),
        "accent_soft": make_material("launch_accent_soft", (accent[0], accent[1], accent[2], 1), roughness=0.38, alpha=0.28, emission=accent, emission_strength=0.7),
        "warning": make_material("transparent_warning_plate", (1.0, 0.22, 0.12, 1), roughness=0.35, alpha=0.34, emission=(1.0, 0.18, 0.06), emission_strength=0.3),
    }


def make_curve(
    name: str,
    coords: list[tuple[float, float, float]],
    material: bpy.types.Material,
    bevel_depth: float,
    *,
    bevel_resolution: int = 3,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = bevel_resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(coords) - 1)
    for point, coord in zip(spline.points, coords):
        point.co = (coord[0], coord[1], coord[2], 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def make_cylinder(
    name: str,
    radius: float,
    depth: float,
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float] = (0, 0, 0),
    vertices: int = 96,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def make_cube(
    name: str,
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def make_shell(
    name: str,
    x0: float,
    x1: float,
    inner_r: float,
    outer_r: float,
    material: bpy.types.Material,
    *,
    start_angle: float = math.radians(218),
    end_angle: float = math.radians(506),
    x_segments: int = 72,
    angle_segments: int = 88,
    ovality: float = 0,
) -> bpy.types.Object:
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    angles = [start_angle + (end_angle - start_angle) * j / angle_segments for j in range(angle_segments + 1)]

    def add_surface(radius: float) -> list[list[int]]:
        rows = []
        for i in range(x_segments + 1):
            t = i / x_segments
            x = x0 + (x1 - x0) * t
            local_oval = ovality * math.exp(-0.5 * ((x - 0.58) / 0.58) ** 2)
            sy = 1 + local_oval
            sz = 1 - local_oval * 0.74
            row = []
            for theta in angles:
                verts.append((x, radius * sy * math.cos(theta), radius * sz * math.sin(theta)))
                row.append(len(verts) - 1)
            rows.append(row)
        return rows

    outer = add_surface(outer_r)
    inner = add_surface(inner_r)
    for i in range(x_segments):
        for j in range(angle_segments):
            faces.append([outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]])
            faces.append([inner[i][j + 1], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j]])

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def make_braid(mats: dict[str, bpy.types.Material], case_id: str) -> None:
    carriers = 18
    turns = 4.2
    radius = 0.372
    for carrier in range(carriers):
        phase = math.tau * carrier / carriers
        for handedness, prefix in ((1, "RH"), (-1, "LH")):
            coords = []
            for index in range(135):
                t = index / 134
                x = -3.0 + 4.0 * t
                oval = 0.24 * math.exp(-0.5 * ((x - 0.58) / 0.55) ** 2) if case_id == "crimp-ovality" else 0
                theta = phase + handedness * turns * math.tau * t
                y = radius * (1 + oval) * math.cos(theta)
                z = radius * (1 - oval * 0.72) * math.sin(theta)
                coords.append((x, y, z))
            mat = mats["braid_a"] if (carrier + (0 if handedness > 0 else 1)) % 2 else mats["braid_b"]
            make_curve(f"launch_braid_{prefix}_{carrier:02d}", coords, mat, 0.006, bevel_resolution=2)


def add_connector_base(case_id: str, mats: dict[str, bpy.types.Material]) -> None:
    ovality = 0.22 if case_id == "crimp-ovality" else 0
    make_shell("outer_jacket_cutaway", -3.15, 0.20, 0.42, 0.52, mats["jacket"], ovality=ovality * 0.45)
    make_shell("foil_cutaway", -3.05, 0.92, 0.302, 0.322, mats["foil"], ovality=ovality * 0.7)
    make_braid(mats, case_id)
    make_shell("ferrule_crimp_sleeve", 0.05, 1.42, 0.45, 0.58, mats["shell"], start_angle=math.radians(195), end_angle=math.radians(520), ovality=ovality)
    make_shell("connector_body_cutaway", 1.12, 3.14, 0.36, 0.72, mats["shell_dark"], start_angle=math.radians(215), end_angle=math.radians(500))

    dielectric_end = 1.18 if case_id == "dielectric-gap" else 1.45
    if case_id == "strip-length":
        dielectric_end = 1.05
    make_shell("ptfe_dielectric_cutaway", -3.08, dielectric_end, 0.074, 0.278, mats["dielectric"], start_angle=math.radians(210), end_angle=math.radians(512))
    make_cylinder("center_conductor", 0.074, 4.60, mats["copper"], location=(-0.72, 0, 0), vertices=72)

    pin_start = 1.12
    pin_len = 1.92
    if case_id == "pin-plane":
        pin_len = 2.18
    make_cylinder("gold_center_pin", 0.095, pin_len, mats["gold"], location=(pin_start + pin_len / 2, 0, 0), vertices=80)

    make_cylinder("rear_connector_insulator", 0.30, 0.48, mats["dielectric_face"], location=(1.58, 0, 0), vertices=96)
    make_cylinder("front_socket_insulator", 0.26, 0.46, mats["dielectric_face"], location=(2.68, 0, 0), vertices=96)

    for x, radius, minor, mat, name in (
        (1.10, 0.61, 0.018, mats["shell"], "rear_body_reference_ring"),
        (1.68, 0.73, 0.026, mats["shell"], "knurled_shell_ring_a"),
        (2.36, 0.73, 0.026, mats["shell"], "knurled_shell_ring_b"),
        (3.16, 0.57, 0.018, mats["shell"], "front_connector_face"),
    ):
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=minor, major_segments=128, minor_segments=12, location=(x, 0, 0), rotation=(0, math.pi / 2, 0))
        obj = bpy.context.object
        obj.name = name
        obj.data.materials.append(mat)

    # Subtle knurl lines on the connector body.
    for index in range(11):
        x = 1.55 + index * 0.075
        make_curve(
            f"connector_knurl_{index:02d}",
            [(x, -0.55, 0.38), (x + 0.10, 0.55, -0.38)],
            mats["shell"],
            0.004,
            bevel_resolution=1,
        )


def add_reference_planes(mats: dict[str, bpy.types.Material]) -> None:
    for x, mat, name in ((1.45, mats["accent_soft"], "reference_launch_plane"), (1.88, mats["accent"], "actual_pin_plane")):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.34, minor_radius=0.006, major_segments=96, minor_segments=8, location=(x, 0, 0), rotation=(0, math.pi / 2, 0))
        obj = bpy.context.object
        obj.name = name
        obj.data.materials.append(mat)
    make_curve("pin_plane_delta_arrow", [(1.45, -0.54, 0.40), (1.88, -0.54, 0.40)], mats["accent"], 0.008, bevel_resolution=3)


def add_strip_ruler(mats: dict[str, bpy.types.Material]) -> None:
    make_curve("strip_length_bracket", [(-0.16, -0.60, 0.44), (1.12, -0.60, 0.44)], mats["accent"], 0.008, bevel_resolution=3)
    for x in (-0.16, 1.12):
        make_curve(f"strip_length_tick_{x}", [(x, -0.60, 0.30), (x, -0.60, 0.58)], mats["accent"], 0.007, bevel_resolution=2)
    make_shell("excess_exposed_dielectric_zone", 0.82, 1.25, 0.29, 0.34, mats["accent_soft"], start_angle=math.radians(202), end_angle=math.radians(515))


def add_gap_field(mats: dict[str, bpy.types.Material]) -> None:
    make_cube("air_gap_glow_plate", (0.13, 0.50, 0.42), mats["accent_soft"], location=(1.34, -0.02, 0), rotation=(0, 0, math.radians(3)))
    for index in range(7):
        phase = -0.35 + index * 0.12
        pts = []
        for step in range(42):
            t = step / 41
            pts.append((1.22 + t * 0.32, -0.31 - 0.06 * math.sin(t * math.pi + phase), -0.24 + t * 0.50))
        make_curve(f"gap_fringe_field_{index:02d}", pts, mats["accent"], 0.005, bevel_resolution=3)


def add_ferrule_step(mats: dict[str, bpy.types.Material]) -> None:
    make_shell("raised_ferrule_step", 0.72, 1.08, 0.57, 0.66, mats["accent_soft"], start_angle=math.radians(196), end_angle=math.radians(520))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.67, minor_radius=0.014, major_segments=128, minor_segments=10, location=(1.06, 0, 0), rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = "ferrule_step_edge"
    obj.data.materials.append(mats["accent"])


def add_crimp_ovality(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    for z, name in ((0.66, "upper_crimp_die"), (-0.66, "lower_crimp_die")):
        make_cube(name, (0.48, 0.88, 0.030), mats["warning"], location=(0.58, 0, z), rotation=(0, 0, math.radians(2 if z > 0 else -2)))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.61, minor_radius=0.012, major_segments=128, minor_segments=8, location=(0.58, 0, 0), rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = "oval_crimp_warning_ring"
    obj.scale.y = 1.18
    obj.scale.z = 0.70
    obj.data.materials.append(mats["accent"])


def add_golden_marks(mats: dict[str, bpy.types.Material]) -> None:
    for x in (1.18, 1.45, 1.68):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.34, minor_radius=0.006, major_segments=96, minor_segments=8, location=(x, 0, 0), rotation=(0, math.pi / 2, 0))
        obj = bpy.context.object
        obj.name = "golden_control_plane"
        obj.data.materials.append(mats["accent"])
    make_curve("clean_launch_signal", [(-2.35, -0.55, 0.48), (-0.4, -0.55, 0.48), (1.45, -0.55, 0.48), (2.92, -0.55, 0.48)], mats["accent"], 0.007, bevel_resolution=3)


def add_case_annotation(case: dict, mats: dict[str, bpy.types.Material]) -> None:
    case_id = case["id"]
    if case_id == "pin-plane":
        add_reference_planes(mats)
    elif case_id == "strip-length":
        add_strip_ruler(mats)
    elif case_id == "dielectric-gap":
        add_gap_field(mats)
    elif case_id == "ferrule-step":
        add_ferrule_step(mats)
    elif case_id == "crimp-ovality":
        add_crimp_ovality(case, mats)
    else:
        add_golden_marks(mats)


def add_floor(mats: dict[str, bpy.types.Material]) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.90))
    floor = bpy.context.object
    floor.name = "launch_lab_floor"
    floor.dimensions = (7.8, 3.4, 0.045)
    floor.data.materials.append(mats["floor"])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_lighting(case: dict) -> None:
    bpy.ops.object.light_add(type="AREA", location=(-2.8, -4.8, 3.6))
    key = bpy.context.object
    key.name = "large_connector_softbox"
    key.data.energy = 760
    key.data.size = 4.8

    bpy.ops.object.light_add(type="AREA", location=(3.0, 2.5, 2.2))
    rim = bpy.context.object
    rim.name = "colored_launch_rim"
    rim.data.energy = 170
    rim.data.size = 2.7
    rim.data.color = case["accent"]


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera() -> None:
    bpy.ops.object.camera_add(location=(4.6, -4.8, 2.35))
    camera = bpy.context.object
    camera.name = "RF_Connector_Launch_Camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.15
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 5.8
    camera.data.dof.aperture_fstop = 7.5
    look_at(camera, Vector((0.28, 0, 0.05)))
    bpy.context.scene.camera = camera


def build_case(case: dict) -> None:
    mats = make_materials(case)
    add_floor(mats)
    add_connector_base(case["id"], mats)
    add_case_annotation(case, mats)
    add_lighting(case)
    add_camera()


def render_case(case: dict, *, save_blend: bool = False) -> None:
    clear_scene()
    configure_scene()
    build_case(case)
    bpy.context.scene.render.filepath = str(RENDERS_DIR / case["output"])
    bpy.ops.render.render(write_still=True)
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
        backup_path = Path(str(BLEND_PATH) + "1")
        if backup_path.exists():
            backup_path.unlink()


def main() -> None:
    ensure_dirs()
    for index, case in enumerate(CASES):
        render_case(case, save_blend=index == len(CASES) - 1)


if __name__ == "__main__":
    main()
