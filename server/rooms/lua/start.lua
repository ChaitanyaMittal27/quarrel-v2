-- KEYS: player pointer, expected room, presence A, presence B, messages, deadlines.
-- ARGV: expected room ID, caller ID, discovered A ID, discovered B ID, test-only now.
local current = redis.call('GET', KEYS[1])
if not current then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local now = clock_now(ARGV[5])
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local a = redis.call('HGET', KEYS[2], 'a.player') or ''
local b = redis.call('HGET', KEYS[2], 'b.player') or ''
if a ~= ARGV[3] or b ~= ARGV[4] then return cjson.encode({status='RETRY'}) end
if a ~= ARGV[2] then return cjson.encode({status='FORBIDDEN'}) end
if redis.call('HGET', KEYS[2], 'closed') == '1'
  or redis.call('HGET', KEYS[2], 'a.left') ~= '0' or redis.call('HGET', KEYS[2], 'b.left') == '1' then
  return cjson.encode({status='ROOM_CLOSED'})
end
if redis.call('HGET', KEYS[2], 'phase') ~= 'planning' then return cjson.encode({status='WRONG_PHASE'}) end
if redis.call('HEXISTS', KEYS[2], 'plan') == 0 then return cjson.encode({status='PLAN_NOT_READY'}) end
if b == '' or redis.call('EXISTS', KEYS[3]) == 0 or redis.call('EXISTS', KEYS[4]) == 0 then
  return cjson.encode({status='PLAYER_NOT_CONNECTED'})
end
redis.call('HSET', KEYS[2], 'phase', 'debate', 'startsAt', now + 3000)
clock_open(KEYS[2], KEYS[5], cjson.decode(redis.call('HGET', KEYS[2], 'plan')), 1, now + 3000)
local result = clock_result(KEYS[2], now, true)
result.roomId = current
return cjson.encode(result)
