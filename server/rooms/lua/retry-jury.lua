-- KEYS: player pointer, room, primary/fallback quota. ARGV: room ID, player ID, test now, check quota.
local current = redis.call('GET', KEYS[1])
if not current then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if current ~= ARGV[1] then return cjson.encode({status='STALE_ROOM'}) end
if redis.call('EXISTS', KEYS[2]) == 0 then return cjson.encode({status='ROOM_NOT_FOUND'}) end
local room = KEYS[2]
local time = redis.call('TIME')
local now = tonumber(ARGV[3]) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
if tonumber(redis.call('HGET', room, 'expiresAt')) <= now then return cjson.encode({status='ROOM_EXPIRED'}) end
local seat
for _, s in ipairs({'a', 'b'}) do if redis.call('HGET', room, s .. '.player') == ARGV[2] then seat = s end end
if not seat or redis.call('HGET', room, seat .. '.left') == '1' then return cjson.encode({status='ROOM_NOT_FOUND'}) end
if redis.call('HGET', room, 'closed') == '1' then return cjson.encode({status='ROOM_CLOSED'}) end
if redis.call('HGET', room, 'phase') ~= 'jury' then return cjson.encode({status='WRONG_PHASE'}) end
if redis.call('HGET', room, 'juryStatus') ~= 'retry_required' then return cjson.encode({status='JURY_NOT_READY'}) end
if ARGV[4] == '1' and redis.call('EXISTS', KEYS[3]) == 1 and redis.call('EXISTS', KEYS[4]) == 1 then
  return cjson.encode({status='JURY_QUOTA_EXHAUSTED'})
end
if now < tonumber(redis.call('HGET', room, 'juryRetryAvailableAt') or '0') then return cjson.encode({status='JURY_RETRY_COOLDOWN'}) end
local round = redis.call('HINCRBY', room, 'juryRound', 1)
redis.call('HSET', room, 'juryStatus', 'pending', 'juryAttempts', 0, 'juryRetryAvailableAt', now + 60000)
redis.call('HDEL', room, 'juryError', 'juryClaimToken')
redis.call('HINCRBY', room, 'version', 1)
return cjson.encode({status='OK', roomId=ARGV[1], changed=true, judge={kind='jury', index=round}})
