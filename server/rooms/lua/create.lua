-- KEYS: player pointer, candidate room, candidate code, previous room.
-- ARGV: expected pointer, new room ID, code, player ID, name, lifetime ms, theme, topic, durationSec.
local current = redis.call('GET', KEYS[1]) or ''
if current ~= ARGV[1] then return cjson.encode({status='RETRY'}) end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if current ~= '' then
  local expiry = redis.call('HGET', KEYS[4], 'expiresAt')
  -- Rules 1.4-1.5: preserve a live seat, detach an expired/missing one.
  if expiry and tonumber(expiry) > now then
    return cjson.encode({status='OK', roomId=current, changed=false})
  end
  redis.call('DEL', KEYS[1])
end
-- Rule 1.2: claim the code before writing a room. Collisions never overwrite.
local expiry = now + tonumber(ARGV[6])
if not redis.call('SET', KEYS[3], ARGV[2], 'NX', 'PXAT', expiry + 86400000) then
  return cjson.encode({status='CODE_TAKEN'})
end
redis.call('HSET', KEYS[2], 'code', ARGV[3], 'createdAt', now, 'expiresAt', expiry,
  'version', 1, 'closed', '0', 'a.player', ARGV[4], 'a.name', ARGV[5], 'a.ready', '0', 'a.left', '0',
  'debateId', ARGV[10], 'debateCreatedAt', now, 'phase', 'waiting', 'theme', ARGV[7], 'topic', ARGV[8], 'durationSec', ARGV[9], 'a.position', '')
redis.call('PEXPIREAT', KEYS[2], expiry + 86400000)
redis.call('SET', KEYS[1], ARGV[2])
return cjson.encode({status='OK', roomId=ARGV[2], changed=true})
