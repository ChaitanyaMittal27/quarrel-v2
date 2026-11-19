import { useId } from 'react'
import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'

function FilingCabinet({x,y}: {x:number;y:number}) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M0 0H80V126H0Z" fill="#333333"/><path d="M4 4H76V122H4Z" fill="#676767"/>
    {[8,44,80].map(top=><g key={top}><path d={`M8 ${top}H72V${top+30}H8Z`} fill="#494949"/><path d={`M12 ${top+4}H68V${top+8}H12Z`} fill="#878787"/><path d={`M28 ${top+12}H52V${top+20}H28Z`} fill="#adadad"/><path d={`M34 ${top+14}H46V${top+18}H34Z`} fill="#535353"/></g>)}
  </g>;
}

/** Noir office uses neutral grays only; window slats cast long stepped shadows. */

function DetectiveBackground() {
  const id = useId().replace(/:/g, "");
  return <>
    <defs>
      <pattern id={`${id}-paper`} width="48" height="48" patternUnits="userSpaceOnUse"><path d="M0 0H48V48H0Z" fill="#757575"/><path d="M0 0H2V48H0ZM22 0H24V48H22Z" fill="#818181"/><path d="M10 12H12V14H10ZM34 32H36V34H34Z" fill="#696969"/></pattern>
      <pattern id={`${id}-floor`} width="128" height="24" patternUnits="userSpaceOnUse"><path d="M0 0H128V24H0Z" fill="#565656"/><path d="M0 0H128V3H0ZM0 0H3V24H0Z" fill="#323232"/><path d="M8 5H118V7H8ZM34 14H80V16H34Z" fill="#747474"/></pattern>
    </defs>
    <path d="M0 0H960V440H0Z" fill={`url(#${id}-paper)`}/>
    <path d="M0 0H960V22H0Z" fill="#303030"/><path d="M0 22H960V28H0Z" fill="#b1b1b1"/>
    <path d="M250 28H710V296H250Z" fill="#272727"/>
    <path d="M258 36H702V288H258Z" fill="#b7b7b7"/>
    <path d="M268 46H692V276H268Z" fill="#383838"/>
    <path d="M278 54H682V268H278Z" fill="#939393"/>
    <path d="M278 178H300V144H330V162H352V112H380V176H404V140H428V166H450V128H480V176H506V146H532V108H554V172H580V134H606V168H632V142H660V122H682V268H278Z" fill="#5e5e5e"/>
    <path d="M278 218H312V192H340V208H366V170H390V216H422V182H454V212H486V190H510V210H540V176H564V212H596V184H626V208H656V186H682V268H278Z" fill="#424242"/>
    {[294,338,382,426,470,514,558,602,646].map((x,i)=><path key={x} d={`M${x} ${64+i%3*10}H${x+2}V${80+i%3*10}H${x-2}V${94+i%3*10}H${x-4}V${98+i%3*10}H${x-6}V${84+i%3*10}H${x-2}V${70+i%3*10}H${x}Z`} fill="#dadada" opacity=".6"/>)}
    {[62,86,110,134,158,182,206,230].map(y=><g key={y}><path d={`M270 ${y}H690V${y+8}H270Z`} fill="#242424"/><path d={`M274 ${y+2}H686V${y+4}H274Z`} fill="#b5b5b5"/><path d={`M282 ${y+8}H678V${y+12}H282Z`} fill="#d5d5d5" opacity=".25"/></g>)}
    <path d="M472 46H486V276H472Z" fill="#303030"/><path d="M474 48H478V274H474Z" fill="#b5b5b5"/>
    <path d="M686 54H690V244H686ZM686 244H694V254H686Z" fill="#e1e1e1"/>
    <path d="M240 278H720V286H726V298H234V286H240Z" fill="#363636"/><path d="M240 280H720V286H240Z" fill="#d5d5d5"/>
    <path d="M0 304H960V332H0Z" fill="#333333"/><path d="M0 302H960V308H0Z" fill="#ababab"/>
    <path d="M0 330H960V440H0Z" fill={`url(#${id}-floor)`}/>
    <path d="M284 330H330L484 440H430ZM378 330H424L578 440H524ZM472 330H518L672 440H618ZM566 330H612L766 440H712Z" fill="#d4d4d4" opacity=".18"/>
    <path d="M0 420H960V440H0Z" fill="#292929"/><path d="M0 422H960V428H0Z" fill="#929292"/>
    <g className="theme-scenery-wide">
      <FilingCabinet x={80} y={204}/><FilingCabinet x={164} y={204}/>
      <path d="M96 100H224V184H96Z" fill="#292929"/><path d="M102 106H218V178H102Z" fill="#a9a9a9"/>
      <path d="M112 118H152V142H112ZM168 116H208V154H168ZM138 152H166V170H138Z" fill="#dddddd"/>
      <path d="M118 124H144V126H118ZM118 132H138V134H118ZM174 124H200V126H174ZM174 136H198V138H174ZM144 158H160V160H144Z" fill="#7b7b7b"/>
      <path d="M152 128H170V130H152ZM152 130H154V154H152ZM164 158H184V160H164V158Z" fill="#454545"/>
      <path d="M790 52H830V60H842V76H848V102H840V116H824V124H796V116H780V102H776V76H784V60H790Z" fill="#303030"/>
      <path d="M796 60H824V68H836V80H840V98H832V110H820V116H800V110H788V98H784V80H792V68H796Z" fill="#d4d4d4"/>
      <path d="M808 68H812V90H824V94H806V68Z" fill="#3a3a3a"/>
      <path d="M808 62H812V66H808ZM834 88H838V92H834ZM808 110H812V114H808ZM786 88H790V92H786Z" fill="#5b5b5b"/>
      <path d="M784 214H870V220H882V236H770V224H776V220H784Z" fill="#c4c4c4"/>
      <path d="M822 232H830V318H822ZM802 316H850V324H802Z" fill="#343434"/>
      <path d="M774 236H878V244H774Z" fill="#525252"/>
      <path d="M800 326H850V330H800Z" fill="#d5d5d5"/>
    </g>
    <path d="M282 310H336V320H282ZM624 310H676V320H624Z" fill="#b7b7b7" opacity=".45"/>
    <path d="M284 390H678V394H692V414H278V396H284Z" fill="#222222" opacity=".28"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props} viewBox="0 0 960 440" scenery><DetectiveBackground/></SvgFrame>
}
