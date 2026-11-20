import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { AiNotice } from '../src/game/AiNotice'
import { resetLabel } from '../src/lib/judgment';
import { HomeForm } from '../src/game/HomeScreen';
import { feedbackFor } from '../src/game/errors';
import { ApiError } from '../src/lib/api';

it('calm notices expose only exhaustion, including voice reset; fallback model stays quiet',()=>{
  const status={text:'exhausted' as const,voice:'off' as const,resetsAt:'2030-01-02T08:00:00Z'};
  const markup=renderToStaticMarkup(createElement(AiNotice,{status}));
  expect(markup).toContain("Today&#x27;s free AI limit is reached.");expect(markup).toContain('Voice is resting until');expect(markup).toContain(resetLabel(status));
  expect(renderToStaticMarkup(createElement(AiNotice,{status:{text:'fallback',voice:'ok',resetsAt:null}}))).toBe('');
  expect(resetLabel({...status,resetsAt:null})).toBe('the daily reset');
});
it('Home always shows privacy text, and room rate errors belong to create/join actions with the wait',()=>{
  const markup=renderToStaticMarkup(createElement(HomeForm,{busy:false,onAction:()=>{},onEdit:()=>{},values:{name:'',topic:'',code:'',theme:'courtroom',durationSec:120}}));
  expect(markup).toContain('Google may use content to improve its products');expect(markup).toContain('personal information');
  for(const action of ['create','join'] as const){const feedback=feedbackFor(new ApiError('ROOM_RATE_LIMITED','PRIVATE',3600),action);expect(feedback.buttons[action]).toContain('60 minute');expect(feedback.banner).toBe('');expect(JSON.stringify(feedback)).not.toContain('PRIVATE');}
});
