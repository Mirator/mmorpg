# Consumable Visuals

To add 3D models for potions and food:

1. Convert FBX to glTF from `hidden_resources/Ultimate Food Pack - Oct 2019/FBX/`:
   - Bottle1.fbx → Bottle1.gltf (health potion)
   - Bottle2.fbx → Bottle2.gltf (mana potion)
   - Apple.fbx, Bread.fbx, ChickenLeg.fbx, etc. for food

2. Use Blender: File → Import → FBX, then File → Export → glTF 2.0

3. Or use FBX2glTF: https://github.com/facebookincubator/FBX2glTF

Asset paths are configured in client/assetPaths.js under ASSET_PATHS.consumables.
