local raw = redis.call('GET', KEYS[1])
if not raw then return 'unknown' end
local record = cjson.decode(raw)
if record.familyId ~= ARGV[1] then return 'unknown' end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'revoked' end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if record.used then
  if record.usedAt and now - record.usedAt <= tonumber(ARGV[4]) then return 'raced' end
  redis.call('SET', KEYS[2], 'revoked', 'EX', ARGV[3])
  return 'reused'
end
record.used = true
record.usedAt = now
redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL')
redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[3])
return 'rotated'
