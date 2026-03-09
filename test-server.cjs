const fastify = require('fastify')({ logger: true });

fastify.get('/test', async (request, reply) => {
  return {
    query: request.query,
    periodMode: request.query.periodMode,
    month: request.query.month,
    date: request.query.date
  };
});

fastify.listen({ port: 3333 }).then(() => {
  console.log('Test server on port 3333');
});
