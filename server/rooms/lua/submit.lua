-- KEYS: player pointer, room, messages, requests, deadlines.
-- ARGV: room ID, caller ID, ordinal, raw text, UUID, content hash, test-only now override.
local current = redis.call('GET', KEYS[1])
if not current then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local now = clock_now(ARGV[7])
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local seat
if redis.call('HGET', KEYS[2], 'a.player') == ARGV[2] then seat = 'a' end
if redis.call('HGET', KEYS[2], 'b.player') == ARGV[2] then seat = 'b' end
if not seat or redis.call('HGET', KEYS[2], seat .. '.left') == '1' then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if redis.call('HGET', KEYS[2], 'closed') == '1' then return cjson.encode({status='ROOM_CLOSED'}) end
local changed = clock_catchup(KEYS[2], KEYS[3], now)
local function result(status)
  local value = clock_result(KEYS[2], now, changed, status)
  value.roomId = current
  return cjson.encode(value)
end
-- Rule 4.8: idempotency precedes phase, ordinal, turn and cap checks.
local request = seat .. ':' .. ARGV[5]
local previous = redis.call('HGET', KEYS[4], request)
if previous then
  if previous == ARGV[6] then return result('OK') end
  return result('REQUEST_CONFLICT')
end
local phase = redis.call('HGET', KEYS[2], 'phase')
if phase == 'ended' then return result('DEBATE_COMPLETE') end
if phase ~= 'debate' or now < tonumber(redis.call('HGET', KEYS[2], 'startsAt')) then return result('DEBATE_NOT_STARTED') end
if tonumber(ARGV[3]) ~= tonumber(redis.call('HGET', KEYS[2], 'ordinal')) then return result('STALE_TURN') end
if string.upper(seat) ~= redis.call('HGET', KEYS[2], 'activeSlot') then return result('NOT_YOUR_TURN') end
local deadline = tonumber(redis.call('HGET', KEYS[2], 'deadline'))
if now >= deadline then return result('TURN_EXPIRED') end
if tonumber(redis.call('HGET', KEYS[2], seat .. '.arguments')) >= 12 then return result('LIMIT_REACHED') end
redis.call('HSET', KEYS[2], seat .. '.remainingMs', math.max(0, deadline - now))
redis.call('HINCRBY', KEYS[2], seat .. '.arguments', 1)
clock_message(KEYS[2], KEYS[3], tonumber(ARGV[3]), 'argument', string.upper(seat), ARGV[4], now)
redis.call('HSET', KEYS[4], request, ARGV[6])
redis.call('PEXPIREAT', KEYS[4], tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) + 86400000)
clock_next(KEYS[2], KEYS[3], now, seat == 'a' and 'B' or 'A')
changed = true
return result('OK')
