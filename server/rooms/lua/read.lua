-- KEYS: player pointer, current room, presence A, presence B.
-- ARGV: expected pointer, expected player A, expected player B, viewer ID.
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
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
return cjson.encode({status='OK', roomId=current, fields=redis.call('HGETALL', KEYS[2]),
  now=now, presence={a ~= '' and redis.call('EXISTS', KEYS[3]) == 1,
                     b ~= '' and redis.call('EXISTS', KEYS[4]) == 1}})
