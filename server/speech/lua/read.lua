-- KEYS: player pointer, room, public messages. ARGV: room ID, player ID.
local current = redis.call('GET', KEYS[1])
if not current then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local seat
for _, s in ipairs({'a','b'}) do if redis.call('HGET', KEYS[2], s .. '.player') == ARGV[2] then seat=s end end
if not seat or redis.call('HGET', KEYS[2], seat .. '.left') == '1' then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local time = redis.call('TIME')
local now = tonumber(time[1])*1000 + math.floor(tonumber(time[2])/1000)
if tonumber(redis.call('HGET', KEYS[2], 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local fields = {}
for _, field in ipairs({'debateId','theme','a.lawyerId','b.lawyerId','verdict'}) do
  local value = redis.call('HGET', KEYS[2],field)
  if value then fields[#fields+1]=field; fields[#fields+1]=value end
end
local result = {status='OK',fields=fields}
local messages=redis.call('LRANGE',KEYS[3],0,-1)
if #messages>0 then result.messages=messages end
return cjson.encode(result)
