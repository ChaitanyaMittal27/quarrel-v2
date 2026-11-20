import { describe,expect,it } from 'vitest';
import { GeminiVoice,Voice,lawyers,playerCharacters,themes } from '../config';
import { SpeechRequest,SpeechId,SpeechErrorResponse } from '../contract';
import { speakableItems,speechBlocked } from '../speech';

describe('Stage 9 voice and speech contract',()=>{
  it('all lawyers and judges have valid prebuilt/browser voices; player characters have no voice',()=>{
    expect(GeminiVoice.options).toHaveLength(30);
    for(const entry of [...lawyers,...themes.map((t)=>t.judge)])expect(Voice.safeParse({geminiVoice:entry.geminiVoice,browserVoice:entry.browserVoice}).success).toBe(true);
    for(const entry of playerCharacters)expect(entry).not.toHaveProperty('geminiVoice');
    for(const value of [{geminiVoice:'invented',browserVoice:{pitch:1,rate:1}},{geminiVoice:'Puck',browserVoice:{pitch:3,rate:1}},{geminiVoice:'Puck',browserVoice:{pitch:1,rate:0}},{geminiVoice:'Puck',browserVoice:{pitch:1,rate:1,extra:true}}])expect(Voice.safeParse(value).success).toBe(false);
  });
  it('strict ID-only request and explicit fallback error contract',()=>{
    const speechId='d_AAAAAAAAAAAAAAAAAAAAAA:m_1';expect(SpeechId.safeParse(speechId).success).toBe(true);expect(SpeechRequest.parse({speechId})).toEqual({speechId});
    for(const value of [{speechId,text:'forged'},{speechId:'m_1'},{}])expect(SpeechRequest.safeParse(value).success).toBe(false);
    expect(SpeechErrorResponse.parse({error:{code:'SPEECH_BLOCKED',message:'Not available'},fallbackAllowed:false}).fallbackAllowed).toBe(false);
    expect(SpeechErrorResponse.safeParse({error:{code:'SPEECH_BUSY',message:'Busy'}}).success).toBe(false);
  });
  it('public allowlist, voice resolution and threat flags are shared by both playback engines',()=>{
    const input={debateId:'d_AAAAAAAAAAAAAAAAAAAAAA',theme:'courtroom',lawyers:{A:'jungle-tavi',B:'missing'},messages:[
      {id:'a',kind:'argument',slot:'A' as const,text:'Public words'}, {id:'b',kind:'argument',slot:'B' as const,text:'I will hurt you'},
      {id:'c',kind:'consult',slot:'A' as const,text:'PRIVATE'}, {id:'d',kind:'argument',slot:null,text:'No author'}, {id:'e',kind:'announcement',slot:null,text:' '},
      {id:'s',kind:'judge_summary',slot:null,text:'Public summary'}],verdict:{text:'Public verdict'}};
    const items=speakableItems(input);expect(items).toHaveLength(4);expect(items[0]!.voice.geminiVoice).toBe('Puck');expect(items[1]!.voice.geminiVoice).toBe('Charon');expect(items[1]!.speechBlocked).toBe(true);expect(JSON.stringify(items)).not.toContain('PRIVATE');
    expect(items[2]!.kind).toBe('summary');expect(items[3]!.kind).toBe('verdict');
    expect(speechBlocked('domestic abuse')).toBe(true);expect(speechBlocked('We can debate the garden.')).toBe(false);
    expect(speakableItems({...input,messages:[],verdict:null})).toEqual([]);
  });
});
