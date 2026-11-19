-- KEYS: player pointer, expected room.
-- ARGV: room ID, caller ID, character ID or empty, lawyer ID or empty, allowed characters JSON, allowed lawyers JSON.
local current = redis.call('GET', KEYS[1])
if not current then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local seat
if redis.call('HGET', KEYS[2], 'a.player') == ARGV[2] then seat = 'a' end
if redis.call('HGET', KEYS[2], 'b.player') == ARGV[2] then seat = 'b' end
if not seat or redis.call('HGET', KEYS[2], seat .. '.left') == '1' then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if redis.call('HGET', KEYS[2], 'phase') == 'ended' then return cjson.encode({status='WRONG_PHASE'}) end
local function valid(id, allowed)
  if id == '' then return true end
  for _, item in ipairs(cjson.decode(allowed)) do if item == id then return true end end
  return false
end
if (ARGV[3] == '' and ARGV[4] == '') or not valid(ARGV[3], ARGV[5]) or not valid(ARGV[4], ARGV[6]) then
  return cjson.encode({status='INVALID_CHOICE'})
end
-- Cosmetics never clear readiness, charge/pause clocks, or change the other seat.
local changed = false
for index, field in ipairs({'characterId', 'lawyerId'}) do
  local value = ARGV[index + 2]
  if value ~= '' and value ~= (redis.call('HGET', KEYS[2], seat .. '.' .. field) or '') then
    redis.call('HSET', KEYS[2], seat .. '.' .. field, value)
    changed = true
  end
end
if changed then redis.call('HINCRBY', KEYS[2], 'version', 1) end
return cjson.encode({status='OK', roomId=current, changed=changed})
