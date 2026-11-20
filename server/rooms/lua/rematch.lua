-- KEYS: player pointer, room, messages, request hashes, deadlines.
-- ARGV: room ID, player ID, expected debate ID, new debate ID, test-only now.
local current = redis.call('GET', KEYS[1])
if not current then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
local room = KEYS[2]
if redis.call('EXISTS', room) == 0 then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local time = redis.call('TIME')
local now = tonumber(ARGV[5]) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
if tonumber(redis.call('HGET', room, 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local seat
for _, s in ipairs({'a', 'b'}) do if redis.call('HGET', room, s .. '.player') == ARGV[2] then seat = s end end
if not seat then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if redis.call('HGET', room, 'phase') ~= 'complete' or redis.call('HGET', room, 'debateId') ~= ARGV[3] then return cjson.encode({status='STALE_DEBATE'}) end
if redis.call('HGET', room, 'closed') == '1' or redis.call('HGET', room, 'a.left') == '1'
  or redis.call('HGET', room, 'b.left') == '1' or redis.call('HEXISTS', room, 'b.player') == 0 then return cjson.encode({status='ROOM_CLOSED'}) end
-- Completion already froze a public archive outbox, so a rematch need not wait for SQL.
if redis.call('HGET', room, seat .. '.rematch') == '1' then return cjson.encode({status='OK', changed=false}) end
redis.call('HSET', room, seat .. '.rematch', '1')
if redis.call('HGET', room, 'a.rematch') == '1' and redis.call('HGET', room, 'b.rematch') == '1' then
  local keep = {code=true, createdAt=true, expiresAt=true, version=true, closed=true, theme=true, topic=true, durationSec=true}
  for _, s in ipairs({'a', 'b'}) do
    for _, field in ipairs({'player', 'name', 'left', 'characterId', 'lawyerId'}) do keep[s .. '.' .. field] = true end
  end
  for _, field in ipairs(redis.call('HKEYS', room)) do if not keep[field] then redis.call('HDEL', room, field) end end
  redis.call('HSET', room, 'debateId', ARGV[4], 'debateCreatedAt', now, 'phase', 'positions', 'a.ready', '0', 'b.ready', '0', 'a.position', '', 'b.position', '')
  redis.call('DEL', KEYS[3], KEYS[4])
  redis.call('ZREM', KEYS[5], ARGV[1])
end
redis.call('HINCRBY', room, 'version', 1)
return cjson.encode({status='OK', roomId=ARGV[1], changed=true})
