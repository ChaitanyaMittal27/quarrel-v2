-- KEYS: room, messages, deadlines. ARGV: test-only now override.
local now = clock_now(ARGV[1])
if redis.call('EXISTS', KEYS[1]) == 0 or tonumber(redis.call('HGET', KEYS[1], 'expiresAt')) <= now then
  redis.call('ZREM', KEYS[3], string.sub(KEYS[1], 6))
  return cjson.encode({status='OK', changed=false, now=now})
end
local changed = clock_catchup(KEYS[1], KEYS[2], now)
local result = clock_result(KEYS[1], now, changed)
if changed then result.roomId = string.sub(KEYS[1], 6) end
if redis.call('HGET', KEYS[1], 'closed') == '1' then result.deadline = cjson.null end
return cjson.encode(result)
