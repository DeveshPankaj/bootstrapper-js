import { BehaviorSubject } from "rxjs"
import _modules from "./modules.json"

//@ts-ignore
const public_path = __webpack_public_path__ as string

export type Module = {
    url: string
    metedata: {
        version: `${string}.${string}.${string}` | string
    }
    params: Array<any>
}


const __BOOTSTRAP_MODULES__ = '__BOOTSTRAP_MODULES__'
const localModules = localStorage.getItem(__BOOTSTRAP_MODULES__)
let localParsedModule = null
if(localModules) {
    localParsedModule = JSON.parse(localModules)
}



const defaultModules: {[key: string]: Module} = localParsedModule || _modules || {}
export const modules = new BehaviorSubject(defaultModules)

