import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { courtB } from '../primitives/counsel-colors'
import { CounselSuit, HumanHead } from '../primitives/counsel'

function CourtCounselB() { return <><CounselSuit p={courtB}/><HumanHead p={courtB} curls/><path d="M29 33H31V36H29Z" fill={courtB.accent}/></>; }

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><CourtCounselB/></g></g></SvgFrame>
}
