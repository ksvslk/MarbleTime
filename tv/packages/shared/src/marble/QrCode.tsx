import qrcode from 'qrcode-generator';
import React, {useMemo} from 'react';
import {View} from 'react-native';

/**
 * A QR code drawn with plain Views (no SVG or native module, so the same code works on Fire OS and Vega).
 * Each row's dark runs are merged into one View, which keeps a pairing link to a few hundred views.
 */
export function QrCode({value, size}: {value: string; size: number}) {
  const rows = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const runs: {row: number; start: number; length: number}[] = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!qr.isDark(row, col)) continue;
        let end = col;
        while (end + 1 < n && qr.isDark(row, end + 1)) end++;
        runs.push({row, start: col, length: end - col + 1});
        col = end;
      }
    }
    return {n, runs};
  }, [value]);

  // A quiet zone of 4 modules all round, as phone cameras expect.
  const cell = size / (rows.n + 8);
  return (
    <View style={{width: size, height: size, backgroundColor: '#FFFFFF'}}>
      {rows.runs.map(({row, start, length}, i) => (
        <View
          key={i}
          style={{position: 'absolute', left: (start + 4) * cell, top: (row + 4) * cell, width: length * cell + 0.5, height: cell + 0.5, backgroundColor: '#000000'}}
        />
      ))}
    </View>
  );
}
