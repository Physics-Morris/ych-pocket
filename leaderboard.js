/* Shared scores use a small, public Supabase RPC API. No SDK or player account needed. */
(() => {
  const boards = ['classic-calm', 'classic-fish', 'color-calm', 'color-fish'];
  function create(config) {
    if (!config?.url || !config?.publishableKey) return null;
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid leaderboard URL');
    const key = config.publishableKey;
    // Catch accidental use of a privileged key before it can be sent anywhere.
    if (key.startsWith('sb_secret_')) throw new Error('Use a publishable key');
    if (!key.startsWith('sb_publishable_')) {
      let claims;
      try { claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { throw new Error('Invalid public key'); }
      if (claims.role !== 'anon') throw new Error('Use an anon key');
    }
    async function rpc(method, body) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const headers = { apikey: key, 'Content-Type': 'application/json' };
        // New publishable keys are not JWTs; only legacy anon keys go in Authorization.
        if (!key.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${key}`;
        const response = await fetch(`${url.origin}/rest/v1/rpc/${method}`, {
          method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'omit'
        });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        return await response.json();
      } finally { clearTimeout(timeout); }
    }
    function validateBoard(board) {
      if (!boards.includes(board)) throw new Error('Unknown challenge');
    }
    return {
      async list(board) {
        validateBoard(board);
        const entries = await rpc('ych_leaderboard', { p_board: board });
        if (!Array.isArray(entries) || entries.length > 10 || entries.some(entry =>
          typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 40 || !Number.isInteger(entry.ms) || entry.ms <= 0
        )) throw new Error('Invalid leaderboard response');
        return entries.map(({ name, ms }) => ({ name, ms }));
      },
      async save({ id, key: board, ms }, name) {
        validateBoard(board);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
          !Number.isInteger(ms) || ms <= 0 || ms > 2147483647 || !name.trim() || name.length > 20) throw new Error('Invalid score');
        const result = await rpc('ych_submit_score', { p_id: id, p_board: board, p_name: name, p_ms: ms });
        if (!Number.isSafeInteger(result?.rank) || result.rank < 1) throw new Error('Invalid save response');
        return result.rank;
      }
    };
  }
  window.YCHLeaderboard = { create };
})();
