import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { heroB } from '../primitives/counsel-colors'
import { CounselSuit, HumanHead, Cape } from '../primitives/counsel'

function HeroCounselB() { return <><Cape p={heroB}/><CounselSuit p={heroB} digital/><HumanHead p={heroB} curls/><path d="M15 15H33V20H30V21H18V20H15Z" fill="#29596f"/><path d="M17 16H31V18H17Z" fill="#93e7d9"/><path d="M18 16H21V17H18Z" fill="#e4fff3"/></>; }

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><HeroCounselB/></g></g></SvgFrame>
}
