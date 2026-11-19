-- KEYS: deadlines. ARGV: batch size, test-only now override.
local time = redis.call('TIME')
local now = tonumber(ARGV[2]) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
local rooms = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, tonumber(ARGV[1]))
-- Redis Lua encodes an empty table as {}, so spell the empty JSON array explicitly.
if #rooms == 0 then return '[]' end
return cjson.encode(rooms)
