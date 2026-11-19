import { useId } from 'react'
import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'

function CityBlock({ x, top, width, color, windows = "#dab674", spire = false }: { x: number; top: number; width: number; color: string; windows?: string; spire?: boolean }) {
  return <g>
    <path d={`M${x} ${top + 14}H${x + 8}V${top}H${x + width - 8}V${top + 14}H${x + width}V330H${x}Z`} fill={color}/>
    {spire && <><path d={`M${x + width / 2 - 4} ${top - 32}H${x + width / 2 + 4}V${top}H${x + width / 2 - 4}Z`} fill={color}/><path d={`M${x + 12} ${top - 8}H${x + width - 12}V${top + 4}H${x + 12}Z`} fill={color}/></>}
    {Array.from({length:Math.max(0,Math.floor((310-top)/24))},(_,row)=>Array.from({length:Math.floor((width-14)/16)},(_,col)=>
      <rect key={`${row}-${col}`} x={x+10+col*16} y={top+24+row*24} width={5} height={8} fill={windows} opacity={(row+col*2)%4===0 ? .65 : .22}/>
    ))}
    <path d={`M${x + 4} ${top + 18}H${x + 8}V326H${x + 4}Z`} fill="#8b9ca6" opacity=".16"/>
  </g>;
}

/** Rooftop scene: architectural shapes and a plain searchlight, no borrowed emblems. */

function SuperheroBackground() {
  const id = useId().replace(/:/g, "");
  return <>
    <defs>
      <pattern id={`${id}-roof`} width="96" height="34" patternUnits="userSpaceOnUse"><path d="M0 0H96V34H0Z" fill="#4a5a6e"/><path d="M0 0H96V4H0ZM0 0H4V34H0Z" fill="#718093"/><path d="M0 30H96V34H0Z" fill="#2a364c"/><path d="M16 12H38V14H16ZM58 20H88V22H58Z" fill="#65748a"/></pattern>
    </defs>
    <path d="M0 0H960V440H0Z" fill="#172137"/>
    <path d="M0 108H960V202H0Z" fill="#263148"/>
    <path d="M0 202H960V344H0Z" fill="#3a475d"/>
    <path d="M664 30H692V36H706V50H712V76H706V90H692V96H664V90H650V76H644V50H650V36H664Z" fill="#d9dbc0"/>
    <path d="M664 38H678V46H670V58H662V72H656V56H660V46H664ZM694 78H702V84H694Z" fill="#aeb9b2"/>
    <path d="M78 32H82V36H78ZM208 62H212V66H208ZM342 30H346V34H342ZM420 72H424V76H420ZM562 36H566V40H562ZM812 54H816V58H812ZM894 30H898V34H894Z" fill="#b9d7d3"/>
    <path d="M104 90H130V84H156V88H184V96H206V102H82V96H104ZM760 114H790V108H826V114H848V120H866V126H736V120H760Z" fill="#56677a" opacity=".5"/>
    <path d="M0 156H36V132H62V146H94V112H126V158H164V134H188V148H216V114H238V158H262V130H294V108H324V152H350V122H380V142H404V112H426V160H454V130H486V146H510V106H536V136H558V152H582V120H612V138H638V110H668V150H698V128H726V152H752V104H784V130H808V148H838V116H866V156H898V134H928V148H960V328H0Z" fill="#39475c"/>
    <CityBlock x={10} top={146} width={94} color="#242f46"/>
    <CityBlock x={108} top={116} width={80} color="#26334b" spire/>
    <CityBlock x={200} top={174} width={82} color="#273850"/>
    <CityBlock x={290} top={126} width={92} color="#26364e" spire/>
    <CityBlock x={386} top={182} width={74} color="#293a50"/>
    <CityBlock x={468} top={154} width={72} color="#29384e"/>
    <CityBlock x={552} top={116} width={88} color="#25344c" spire/>
    <CityBlock x={646} top={178} width={70} color="#27374f"/>
    <CityBlock x={724} top={136} width={100} color="#243147" spire/>
    <CityBlock x={838} top={172} width={112} color="#233048"/>
    {/* A stepped shaft of light is recognizably pixel art at every viewport. */}
    <path d="M692 334H706V290H686V248H666V208H644V166H622V124H600V82H578V40H556V0H326V20H352V40H378V62H404V86H430V110H456V134H482V160H508V186H532V212H558V240H584V266H610V294H638V320H666V334Z" fill="#bfe4ce" opacity=".10"/>
    <path d="M0 302H960V340H0Z" fill="#202c42"/>
    <path d="M0 304H960V312H0Z" fill="#7a8a98"/>
    <path d="M0 312H960V318H0Z" fill="#3f5168"/>
    <path d="M0 334H960V440H0Z" fill={`url(#${id}-roof)`}/>
    <path d="M0 334H960V340H0Z" fill="#82909b"/>
    <path d="M0 424H960V440H0Z" fill="#25314a"/>
    <path d="M0 426H960V430H0Z" fill="#617589"/>
    <path d="M278 388H680V392H696V410H680V414H278V410H262V392H278Z" fill="#172539" opacity=".28"/>
    <g className="theme-scenery-wide">
      <path d="M62 262H146V268H152V332H56V268H62Z" fill="#27384e"/><path d="M64 266H142V274H64Z" fill="#617c89"/>
      <path d="M68 284H136V290H68ZM68 300H136V306H68ZM68 316H136V322H68Z" fill="#172638"/>
      <path d="M796 278H846V286H854V330H790V286H796Z" fill="#35485e"/>
      <path d="M802 282H842V286H802ZM796 290H802V320H796Z" fill="#718998"/>
      <path d="M814 292H826V298H814ZM838 306H844V316H838Z" fill="#e7c979"/>
      <path d="M854 220H860V328H854Z" fill="#253649"/><path d="M844 214H870V220H844Z" fill="#96b0b2"/>
      <path d="M854 192H860V204H854ZM830 204H838V210H830ZM876 204H884V210H876Z" fill="#f5cc76"/>
    </g>
    <path d="M684 300H708V308H714V328H678V310H684Z" fill="#182d40"/>
    <path d="M684 304H704V314H684Z" fill="#80b6b3"/><path d="M688 304H702V308H688Z" fill="#def3cf"/>
    <path d="M692 326H700V338H692ZM680 336H712V342H680Z" fill="#182d40"/>
    <path d="M308 318H326V322H308ZM610 318H628V322H610Z" fill="#5fd4be"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props} viewBox="0 0 960 440" scenery><SuperheroBackground/></SvgFrame>
}
