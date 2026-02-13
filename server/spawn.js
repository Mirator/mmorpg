export function createSpawner(world) {
  let nextSpawnIndex = 0;
  return {
    getSpawnPoint() {
      const point = world.spawnPoints[nextSpawnIndex % world.spawnPoints.length];
      nextSpawnIndex += 1;
      return { x: point.x, y: point.y ?? 0, z: point.z };
    },
  };
}
