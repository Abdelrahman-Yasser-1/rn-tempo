// GET /stats/summary: how many products and users exist.
// A handler is trusted JavaScript that runs in a worker thread (not a sandbox); this one only reads counts.
export default async function (ctx) {
  const products = await ctx.db.count('products');
  const users = await ctx.users.count();
  ctx.log.info('stats summary', { products, users });
  return { products, users };
}
