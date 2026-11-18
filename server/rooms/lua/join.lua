-- KEYS: player pointer, code pointer, target room, previous room.
-- ARGV: expected current room, expected target room, player ID, name.
local current = redis.call('GET', KEYS[1]) or ''
local target = redis.call('GET', KEYS[2]) or ''
if current ~= ARGV[1] or target ~= ARGV[2] then return cjson.encode({status='RETRY'}) end
-- Rule 1.8: these business checks must stay in this order.
if target == '' or redis.call('EXISTS', KEYS[3]) == 0 then
  return cjson.encode({status='ROOM_NOT_FOUND'})
end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if tonumber(redis.call('HGET', KEYS[3], 'expiresAt')) <= now then
  return cjson.encode({status='ROOM_EXPIRED'})
end
if current == target then return cjson.encode({status='OK', roomId=target, changed=false}) end
if current ~= '' then
  local expiry = redis.call('HGET', KEYS[4], 'expiresAt')
  if not expiry or tonumber(expiry) <= now then
    redis.call('DEL', KEYS[1])
  else
    return cjson.encode({status='ALREADY_IN_ROOM'})
  end
end
if redis.call('HGET', KEYS[3], 'closed') == '1' then return cjson.encode({status='ROOM_CLOSED'}) end
if redis.call('HEXISTS', KEYS[3], 'b.player') == 1 then return cjson.encode({status='ROOM_FULL'}) end
-- Rules 1.6-1.9: take the only free seat and attach the player in the same step.
redis.call('HSET', KEYS[3], 'b.player', ARGV[3], 'b.name', ARGV[4], 'b.ready', '0', 'b.left', '0')
redis.call('HINCRBY', KEYS[3], 'version', 1)
redis.call('SET', KEYS[1], target)
return cjson.encode({status='OK', roomId=target, changed=true})
