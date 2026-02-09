export function getDbErrorResponse(err) {
  if (err?.code === 'P2021') {
    return {
      status: 503,
      message: 'Database not migrated. Run npm run db:migrate:dev.',
    };
  }
  return null;
}

export function sendDbError(res, err) {
  const response = getDbErrorResponse(err);
  if (!response) return false;
  res.status(response.status).json({ error: response.message });
  return true;
}
