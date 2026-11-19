import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { noirA } from '../primitives/counsel-colors'
import { CounselSuit, HumanHead } from '../primitives/counsel'

function NoirCounselA() { return <><CounselSuit p={noirA} striped/><HumanHead p={noirA}/><path d="M27 33H30V35H27Z" fill="#e2e2e2"/></>; }

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><NoirCounselA/></g></g></SvgFrame>
}
