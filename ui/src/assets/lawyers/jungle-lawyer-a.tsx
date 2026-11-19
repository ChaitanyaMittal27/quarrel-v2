import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { toucan } from '../primitives/counsel-colors'
import { CounselSuit } from '../primitives/counsel'

function ToucanCounsel() {
  return <>
    <CounselSuit p={toucan}/>
    <path d="M16 7H26V9H30V13H32V22H29V26H26V29H18V27H14V23H12V13H14V9H16Z" fill="#253d3e"/>
    <path d="M16 11H25V13H27V23H24V27H18V25H15V21H14V15H16Z" fill="#fff0c4"/>
    <path d="M17 14H23V20H17Z" fill="#ffffff"/><path d="M20 14H23V20H20Z" fill="#24383d"/><path d="M20 14H21V16H20Z" fill="#ffffff"/>
    <path d="M25 13H35V15H39V18H42V23H39V25H30V23H25Z" fill="#754b35"/>
    <path d="M26 14H34V16H38V19H40V22H37V23H30V21H26Z" fill="#eca54b"/>
    <path d="M27 15H34V17H37V19H28Z" fill="#ffda70"/><path d="M38 19H40V22H37V23H34V21H38Z" fill="#df7750"/>
    <g className="sprite-mouth"><path d="M26 21H34V22H26Z" fill="#4f4537"/></g>
    <path d="M16 8H25V10H17V12H14V11H16Z" fill="#52736a"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><ToucanCounsel/></g></g></SvgFrame>
}
