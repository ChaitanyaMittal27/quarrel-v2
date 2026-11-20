-- KEYS: lock, global leased counter, per-player window, cache. ARGV: token, lease milliseconds.
if redis.call('EXISTS',KEYS[4]) == 1 then return 'HIT' end
if redis.call('EXISTS',KEYS[1]) == 1 then return 'WAIT' end
if tonumber(redis.call('GET',KEYS[3]) or '0') >= 8 then return 'RATE' end
local time=redis.call('TIME')
local now=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now)
if redis.call('ZCARD',KEYS[2]) >= 4 then return 'BUSY' end
redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2])
local count=redis.call('INCR',KEYS[3])
if count==1 then redis.call('PEXPIRE',KEYS[3],60000) end
redis.call('ZADD',KEYS[2],now+tonumber(ARGV[2]),ARGV[1])
local last=redis.call('ZREVRANGE',KEYS[2],0,0,'WITHSCORES')
redis.call('PEXPIREAT',KEYS[2],tonumber(last[2])+1000)
return 'OWN'
