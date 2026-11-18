-- KEYS: player pointer, expected room. ARGV: expected room ID, player ID.
local current = redis.call('GET', KEYS[1])
-- Rule 1.14: a repeat is harmless, even if the historical room has expired.
if not current then return cjson.encode({status='OK', changed=false}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then
  redis.call('DEL', KEYS[1])
  return cjson.encode({status='OK', changed=false})
end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local seat
if redis.call('HGET', KEYS[2], 'a.player') == ARGV[2] then seat = 'a' end
if redis.call('HGET', KEYS[2], 'b.player') == ARGV[2] then seat = 'b' end
if not seat or redis.call('HGET', KEYS[2], seat .. '.left') == '1' then
  return cjson.encode({status='ROOM_NOT_FOUND'})
end
redis.call('HSET', KEYS[2], seat .. '.left', '1', seat .. '.ready', '0', 'closed', '1')
redis.call('HINCRBY', KEYS[2], 'version', 1)
redis.call('DEL', KEYS[1])
return cjson.encode({status='OK', roomId=current, changed=true})
