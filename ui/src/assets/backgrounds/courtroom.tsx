import { useId } from 'react'
import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'

function CourtColumn({x}: {x:number}) {
  return <g>
    <path d={`M${x} 34H${x+68}V46H${x}ZM${x+6} 46H${x+62}V56H${x+6}ZM${x+14} 56H${x+54}V286H${x+14}ZM${x+6} 286H${x+62}V296H${x+6}ZM${x} 296H${x+68}V308H${x}Z`} fill="#a3754b"/>
    <path d={`M${x+4} 36H${x+64}V42H${x+4}ZM${x+18} 60H${x+24}V282H${x+18}ZM${x+34} 60H${x+40}V282H${x+34}ZM${x+8} 288H${x+58}V292H${x+8}ZM${x+4} 298H${x+64}V304H${x+4}Z`} fill="#dfba7d"/>
    <path d={`M${x+48} 60H${x+54}V284H${x+48}Z`} fill="#825738"/>
  </g>;
}

function Scales({x,y}: {x:number;y:number}) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-4 0H4V72H-4ZM-36 16H36V22H-36ZM-44 68H44V74H-44ZM-26 74H26V80H-26Z" fill="#936734"/>
    <path d="M-2 2H2V68H-2ZM-34 16H34V18H-34ZM-42 68H42V70H-42Z" fill="#e5c487"/>
    <path d="M-30 22H-28V46H-30ZM28 22H30V46H28ZM-42 44H-16V50H-20V54H-38V50H-42ZM16 44H42V50H38V54H20V50H16Z" fill="#bc9355"/>
    <path d="M-38 46H-20V48H-38ZM20 46H38V48H20Z" fill="#f0d59c"/>
    <path d="M-6 2H6V10H-6Z" fill="#d0aa66"/>
  </g>;
}

function CourtroomBackground() {
  const id = useId().replace(/:/g, "");
  return <>
    <defs>
      <pattern id={`${id}-panel`} width="120" height="140" patternUnits="userSpaceOnUse"><path d="M0 0H120V140H0Z" fill="#a7794d"/><path d="M4 4H116V136H4Z" fill="#765034"/><path d="M10 10H110V130H10Z" fill="#c08e58"/><path d="M16 16H104V124H16Z" fill="#94643d"/><path d="M16 16H104V20H16Z" fill="#d2a771"/><path d="M98 20H104V124H98Z" fill="#67482f"/></pattern>
      <pattern id={`${id}-floor`} width="120" height="30" patternUnits="userSpaceOnUse"><path d="M0 0H120V30H0Z" fill="#9c7048"/><path d="M0 0H120V4H0Z" fill="#cfa56d"/><path d="M0 27H120V30H0ZM0 4H3V27H0Z" fill="#674b36"/><path d="M12 14H48V16H12ZM80 8H110V10H80Z" fill="#b88b57"/></pattern>
    </defs>
    <path d="M0 0H960V440H0Z" fill="#e4d1a6"/>
    <path d="M0 0H960V20H0Z" fill="#573f30"/><path d="M0 20H960V30H0Z" fill="#ba8c56"/><path d="M0 30H960V36H0Z" fill="#f2d7a0"/>
    <path d="M0 170H960V318H0Z" fill={`url(#${id}-panel)`}/>
    <path d="M0 166H960V176H0Z" fill="#6f4b31"/><path d="M0 164H960V168H0Z" fill="#e9c48d"/>
    <path d="M286 170V100H302V76H326V54H354V42H606V54H634V76H658V100H674V170Z" fill="#624834"/>
    <path d="M300 170V106H314V82H338V64H360V54H600V64H622V82H646V106H660V170Z" fill="#c8a66b"/>
    <path d="M312 170V112H326V90H348V74H368V64H592V74H612V90H634V112H648V170Z" fill="#708582"/>
    <path d="M320 166V116H334V96H354V80H374V72H586V80H606V96H626V116H640V166Z" fill="#a9bab0"/>
    <path d="M472 66H488V170H472ZM320 126H640V136H320Z" fill="#e3c68e"/>
    <path d="M476 66H480V170H476ZM322 128H638V132H322Z" fill="#fff0be"/>
    <path d="M354 80H364V164H354ZM596 80H606V164H596Z" fill="#d8b67b"/>
    <path d="M322 154H640V170H322Z" fill="#829d96" opacity=".6"/>
    <CourtColumn x={204}/><CourtColumn x={688}/>
    <path d="M278 44H306V80H300V124H292V166H278Z" fill="#713c42"/><path d="M282 48H292V110H286V150H282Z" fill="#ac6262"/>
    <path d="M654 44H682V166H668V124H660V80H654Z" fill="#713c42"/><path d="M670 48H678V150H674V110H670Z" fill="#ac6262"/>
    <path d="M276 160H300V168H276ZM660 160H684V168H660Z" fill="#dbb476"/>
    <path d="M0 304H960V332H0Z" fill="#5e4230"/><path d="M0 304H960V310H0Z" fill="#d4ac72"/>
    <path d="M0 330H960V440H0Z" fill={`url(#${id}-floor)`}/>
    <path d="M0 420H960V440H0Z" fill="#604634"/><path d="M0 422H960V428H0Z" fill="#bd8c58"/>
    <path d="M308 326H652V334H668V346H292V334H308Z" fill="#523f32"/>
    <path d="M310 326H650V330H310ZM296 336H664V340H296Z" fill="#dec08b"/>
    <path d="M302 346H658V420H302Z" fill="#8b4e4b"/>
    <path d="M310 348H650V420H310Z" fill="#ad7063"/><path d="M316 348H320V420H316ZM640 348H644V420H640Z" fill="#d6b17b"/>
    <g className="theme-scenery-wide">
      <path d="M68 66H170V144H68Z" fill="#6f4c32"/><path d="M74 72H164V138H74Z" fill="#d0aa70"/><path d="M80 78H158V132H80Z" fill="#eadcb8"/>
      <path d="M106 90H132V94H106ZM94 102H144V106H94ZM96 112H142V116H96ZM108 122H132V126H108Z" fill="#a28b64"/>
      <path d="M786 66H888V144H786Z" fill="#6f4c32"/><path d="M792 72H882V138H792Z" fill="#d0aa70"/><path d="M798 78H876V132H798Z" fill="#eadcb8"/>
      <path d="M824 90H850V94H824ZM812 102H862V106H812ZM814 112H860V116H814ZM826 122H850V126H826Z" fill="#a28b64"/>
      <path d="M84 236H174V242H180V324H78V242H84Z" fill="#644a34"/><path d="M84 238H174V244H84Z" fill="#d2a76a"/>
      <path d="M90 248H168V308H90Z" fill="#9a7047"/><path d="M96 254H162V300H96Z" fill="#765238"/>
      <Scales x={128} y={156}/>
      <path d="M786 236H876V242H882V324H780V242H786Z" fill="#644a34"/><path d="M786 238H876V244H786Z" fill="#d2a76a"/>
      <path d="M792 248H870V308H792Z" fill="#9a7047"/><path d="M798 254H864V300H798Z" fill="#765238"/>
      <path d="M800 216H820V234H800ZM824 208H840V234H824ZM844 212H864V234H844Z" fill="#4a5961"/>
      <path d="M804 220H816V224H804ZM828 214H836V218H828ZM848 218H860V222H848Z" fill="#dbc58b"/>
    </g>
    <Scales x={480} y={198}/>
    <path d="M418 284H542V290H418ZM426 290H534V298H426Z" fill="#b78d52"/>
    <path d="M300 394H660V398H674V414H286V400H300Z" fill="#583f31" opacity=".22"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props} viewBox="0 0 960 440" scenery><CourtroomBackground/></SvgFrame>
}
