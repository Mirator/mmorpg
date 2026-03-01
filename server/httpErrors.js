// @ts-check
export function getDbErrorResponse(/** @type {any} */ err) {
  const code = err?.code;
  if (code === 'P2021') {
    return {
      status: 503,
      message: 'Database not migrated. Run npm run db:migrate:dev.',
    };
  }
  if (code === 'P2002') {
    return {
      status: 409,
      message: 'A record with this value already exists.',
    };
  }
  if (code === 'P2003') {
    return {
      status: 409,
      message: 'Referenced record does not exist.',
    };
  }
  if (code === 'P2025') {
    return {
      status: 404,
      message: 'Record not found.',
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
