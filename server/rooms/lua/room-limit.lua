-- KEYS: counter. ARGV: allowed attempts. Fixed hour window starts on the first attempt.
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if count > tonumber(ARGV[1]) then return math.max(1, redis.call('TTL', KEYS[1])) end
return 0
