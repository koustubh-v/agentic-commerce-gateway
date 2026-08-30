import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../cache/client.js';

/**
 * Creates a fastify preHandler hook that verifies the JWT token
 * and ensures the agent has the required scope.
 */
export function authenticateAgent(requiredScope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      
      const user = request.user as any;
      if (!user.scopes || !user.scopes.includes(requiredScope)) {
        return reply.status(403).send({ error: 'insufficient_scope' });
      }

      (request as any).agentId = user.sub;
    } catch (err) {
      return reply.status(401).send({ error: 'invalid_or_expired_token' });
    }
  };
}

/**
 * Enforces an identity-based rate limit for the agent.
 * @param agentId The unique ID of the agent client
 * @param limit Max requests per window
 * @param windowSec Window duration in seconds
 */
export async function rateLimitAgent(agentId: string, limit = 100, windowSec = 60) {
  const windowId = Math.floor(Date.now() / (windowSec * 1000));
  const key = `ratelimit:agent:${agentId}:${windowId}`;
  
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  
  if (count > limit) {
    throw new Error('RateLimitError');
  }
}
