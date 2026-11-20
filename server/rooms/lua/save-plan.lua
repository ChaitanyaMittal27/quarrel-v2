-- KEYS: room. ARGV: validated plan JSON.
if redis.call('EXISTS', KEYS[1]) == 0 then return cjson.encode({status='OK', changed=false}) end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if redis.call('HGET', KEYS[1], 'phase') ~= 'planning'
  or redis.call('HEXISTS', KEYS[1], 'plan') == 1
  or redis.call('HGET', KEYS[1], 'closed') == '1'
  or tonumber(redis.call('HGET', KEYS[1], 'expiresAt')) <= now then
  return cjson.encode({status='OK', changed=false})
end
if ARGV[2] and ARGV[2] ~= '' and redis.call('HGET', KEYS[1], 'debateId') ~= ARGV[2] then return cjson.encode({status='OK', changed=false}) end
local plan = cjson.decode(ARGV[1])
local total = 0
for _, item in ipairs(plan.subtopics) do total = total + item.secondsPerPlayer end
if total ~= tonumber(redis.call('HGET', KEYS[1], 'durationSec')) then
  return cjson.encode({status='INTERNAL'})
end
redis.call('HSET', KEYS[1], 'plan', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'version', 1)
return cjson.encode({status='OK', changed=true})
