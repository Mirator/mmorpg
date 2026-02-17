// @ts-check
export function getDbErrorResponse(/** @type {any} */ err) {
  if (err?.code === 'P2021') {
    return {
      status: 503,
      message: 'Database not migrated. Run npm run db:migrate:dev.',
    };
  }
  return null;
}

export function sendDbError(/** @type {any} */ res, /** @type {any} */ err) {
  const response = getDbErrorResponse(err);
  if (!response) return false;
  res.status(response.status).json({ error: response.message });
  return true;
}
