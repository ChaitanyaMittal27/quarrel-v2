-- KEYS: room, messages. ARGV: expected work ID, test-only now.
local time = redis.call('TIME')
local now = tonumber(ARGV[2]) or tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('HGET', KEYS[1], 'closed') == '1'
  or redis.call('HGET', KEYS[1], 'phase') ~= 'debate'
  or redis.call('HGET', KEYS[1], 'workId') ~= ARGV[1]
  or tonumber(redis.call('HGET', KEYS[1], 'expiresAt')) <= now then return cjson.encode({status='OK'}) end
local result = {status='OK', fields=redis.call('HGETALL', KEYS[1]), now=now}
local messages = redis.call('LRANGE', KEYS[2], 0, -1)
if #messages > 0 then result.messages=messages end
return cjson.encode(result)
