import subprocess, os, tarfile, io, lzma, gzip, sys

libdir = '/home/Maker/.local/lib'
debs_dir = '/tmp/debs'
os.makedirs(libdir, exist_ok=True)

AR_MAGIC = b'!<arch>\n'

for fname in sorted(os.listdir(debs_dir)):
    if not fname.endswith('.deb'):
        continue
    fpath = os.path.join(debs_dir, fname)
    size = os.path.getsize(fpath)
    if size < 1000:
        print(f'SKIP {fname} ({size} bytes)', flush=True)
        continue

    print(f'Processing {fname} ({size} bytes)...', flush=True)

    with open(fpath, 'rb') as f:
        magic = f.read(8)
        if magic != AR_MAGIC:
            print('  NOT a valid .deb', flush=True)
            continue

        while True:
            header = f.read(60)
            if len(header) < 60:
                break
            name = header[:16].strip().decode()
            size_str = header[48:58].strip().decode()
            try:
                member_size = int(size_str)
            except Exception:
                break

            data = f.read(member_size)
            if member_size % 2 == 1:
                f.read(1)

            if name.startswith('data.tar'):
                print(f'  Found {name} ({member_size} bytes)', flush=True)
                try:
                    tar_data = None
                    if name.endswith('.zst'):
                        result = subprocess.run(
                            ['zstd', '-d', '--stdout'],
                            input=data, capture_output=True
                        )
                        tar_data = result.stdout
                    elif name.endswith('.xz'):
                        tar_data = lzma.decompress(data)
                    elif name.endswith('.gz'):
                        tar_data = gzip.decompress(data)
                    else:
                        tar_data = data

                    if tar_data:
                        tf = tarfile.open(fileobj=io.BytesIO(tar_data))
                        for member in tf.getmembers():
                            if '.so' in member.name:
                                basename = os.path.basename(member.name)
                                member.name = basename
                                tf.extract(member, libdir)
                                print(f'    -> {basename}', flush=True)
                        tf.close()
                except Exception as e:
                    print(f'  Error: {e}', flush=True)

print('Done.', flush=True)
