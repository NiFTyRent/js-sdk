import { test } from 'vitest'
import { NiftyRent } from "../src/index";


test('NiftyRent init', () => {
    let niftyrent = new NiftyRent();
    niftyrent.init();
})
