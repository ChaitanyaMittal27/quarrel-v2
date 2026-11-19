-- KEYS: player pointer, current room, presence A, presence B, messages, deadlines.
-- ARGV: expected pointer, expected player A, expected player B, viewer ID, test-only now.
local current = redis.call('GET', KEYS[1]) or ''
if current ~= ARGV[1] then return cjson.encode({status='RETRY'}) end
if current == '' then return cjson.encode({status='OK'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then
  -- Compare-and-delete: never clear a newer seat found by a racing request.
  redis.call('DEL', KEYS[1])
  return cjson.encode({status='OK'})
end
local a = redis.call('HGET', KEYS[2], 'a.player') or ''
local b = redis.call('HGET', KEYS[2], 'b.player') or ''
if a ~= ARGV[2] or b ~= ARGV[3] then return cjson.encode({status='RETRY'}) end
local seat
if a == ARGV[4] then seat = 'a' end
if b == ARGV[4] then seat = 'b' end
if not seat or redis.call('HGET', KEYS[2], seat .. '.left') == '1' then
  return cjson.encode({status='ROOM_NOT_FOUND'})
end
local now = clock_now(ARGV[5])
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local changed = clock_catchup(KEYS[2], KEYS[5], now)
local result = clock_result(KEYS[2], now, changed)
result.roomId = current
result.fields = redis.call('HGETALL', KEYS[2])
local messages = redis.call('LRANGE', KEYS[5], 0, -1)
if #messages > 0 then result.messages = messages end
result.presence = {a ~= '' and redis.call('EXISTS', KEYS[3]) == 1,
                   b ~= '' and redis.call('EXISTS', KEYS[4]) == 1}
if redis.call('HGET', KEYS[2], 'closed') == '1' then result.deadline = cjson.null end
return cjson.encode(result)
