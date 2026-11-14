#!/usr/bin/env python3
"""tools/plate_train_launch.py — runs Megvii YOLOX 0.3.0's own Trainer on a machine WITHOUT CUDA (a Mac: CPU or Apple MPS).

Started by tools/plate_train.py inside its venv. YOLOX 0.3.0 assumes CUDA in a few places (tools/train.py counts GPUs with
nvidia-smi, the trainer pins a CUDA device, the data prefetcher uses CUDA streams, Exp.random_resize allocates on CUDA, the
log line reads CUDA memory). This launcher replaces only those pieces, in memory, for this process; the YOLOX code on disk is
unchanged and the training recipe (exp file) is the same as the Colab notebook's. Evaluation during training is skipped
(eval_interval > max_epoch): the decision is made by tools/plate-det-compare.mjs on the locked field test split.
"""
import argparse
import os
import random
import re
import subprocess
import sys

# Owner rule 2026-11-13: train on the Mac only overnight and ONLY when no other team runs heavy jobs. Training refuses to
# start (it does not wait or retry) when the machine is busy; run it again later.
HEAVY_CPU = 50.0                                   # % CPU of one process
OS_PROCS = re.compile(r"(^|/)(kernel_task|WindowServer)(\s|$)")
OTHER_RUNS = [(re.compile(r"lq-e2e"), "an e2e headless Chrome (lq-e2e profile) is running"),
              (re.compile(r"tests/e2e/run\.mjs"), "an e2e test run is in progress"),
              (re.compile(r"node --test"), "a unit test run is in progress"),
              (re.compile(r"plate_train_launch\.py"), "another plate-detector training is running")]


def busy_reasons(load1, cores, ps_lines, self_pid=None):
    """why the machine is too busy to train now ([] = free). ps_lines: "PID %CPU COMMAND" (ps -A -o pid=,%cpu=,command=)"""
    out = []
    limit = max(2.0, (cores or 1) * 0.5)
    if load1 > limit:
        out.append(f"1-minute load {load1:.1f} > {limit:.1f} (half of {cores} cores, at least 2)")
    ignore = {self_pid, os.getppid() if self_pid == os.getpid() else None}
    seen = set()
    for line in ps_lines:
        m = re.match(r"\s*(\d+)\s+([\d.]+)\s+(.*)", line)
        if not m:
            continue
        pid, cpu, cmd = int(m.group(1)), float(m.group(2)), m.group(3)
        if pid in ignore:
            continue
        hit = next((why for rx, why in OTHER_RUNS if rx.search(cmd)), None)
        if hit:
            if hit not in seen:
                seen.add(hit)
                out.append(f"{hit} (pid {pid})")
            continue
        # any heavy process counts (ffmpeg, encoders, other teams' tools), not only node / python / Chrome by name;
        # the OS's own kernel_task / WindowServer are not jobs
        if cpu >= HEAVY_CPU and not OS_PROCS.search(cmd):
            out.append(f"heavy process pid {pid} at {cpu:.0f} % CPU: {cmd[:80]}")
    return out


def busy_message(reasons):
    return ("plate_train: training not started — the machine is busy (owner rule 2026-11-13: train only when no other team runs "
            "heavy jobs, ideally overnight):\n  - " + "\n  - ".join(reasons) + "\nRun it again when these have finished.")


def machine_busy():
    load1 = os.getloadavg()[0]
    ps = subprocess.run(["ps", "-A", "-o", "pid=,%cpu=,command="], capture_output=True, text=True).stdout.splitlines()
    return busy_reasons(load1, os.cpu_count() or 1, ps, self_pid=os.getpid())


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--yolox", required=True)
    a.add_argument("-f", "--exp", required=True)
    a.add_argument("-c", "--ckpt", required=True)
    a.add_argument("-b", "--batch", type=int, default=16)
    a.add_argument("--device", choices=["cpu", "mps"], default="cpu")
    a.add_argument("--out", required=True)
    a.add_argument("--export", default="", help="write this ONNX file from the checkpoint -c instead of training")
    o = a.parse_args()
    if not o.export:
        reasons = machine_busy()
        if reasons:
            print(busy_message(reasons), file=sys.stderr)
            sys.exit(3)
    sys.path.insert(0, o.yolox)
    import torch
    if o.export:
        return export(o)
    dev = o.device if (o.device == "cpu" or torch.backends.mps.is_available()) else "cpu"
    torch.cuda.set_device = lambda *x, **k: None
    import yolox.core.trainer as T
    from yolox.exp import get_exp

    class Prefetcher:
        def __init__(self, loader):
            self.loader, self.it = loader, iter(loader)

        def next(self):
            try:
                inp, target = next(self.it)[:2]
            except StopIteration:
                self.it = iter(self.loader)
                inp, target = next(self.it)[:2]
            return inp.to(dev), target.to(dev)

    T.DataPrefetcher = Prefetcher
    T.gpu_mem_usage = lambda: 0.0
    init0 = T.Trainer.__init__

    def init(self, exp, args):
        init0(self, exp, args)
        self.device = dev
        self.amp_training = False

    T.Trainer.__init__ = init
    # no COCO evaluation during training (its evaluator is CUDA-bound in 0.3.0): keep the checkpoint instead
    T.Trainer.evaluate_and_save_model = lambda self: self.save_ckpt("last_epoch")

    exp = get_exp(o.exp, None)
    exp.output_dir = o.out
    exp.eval_interval = 10 ** 9

    def random_resize(data_loader, epoch, rank, is_distributed):
        f = exp.input_size[1] * 1.0 / exp.input_size[0]
        s = random.randint(*exp.random_size)
        size = (int(32 * s), 32 * int(s * f))
        data_loader.change_input_dim(multiple=size, random_range=None)
        return size

    exp.random_resize = random_resize
    args = argparse.Namespace(experiment_name=exp.exp_name, name=None, dist_backend="gloo", dist_url=None, batch_size=o.batch, devices=1,
                              resume=False, ckpt=o.ckpt, start_epoch=None, num_machines=1, machine_rank=0, fp16=False, cache=False,
                              occupy=False, logger="tensorboard", opts=[])
    os.makedirs(o.out, exist_ok=True)
    try:
        T.Trainer(exp, args).train()
    except BaseException:
        import traceback
        traceback.print_exc(file=sys.__stderr__)
        raise


def export(o):
    """ONNX as YOLOX 0.3.0 tools/export_onnx.py writes it (raw head: decode_in_inference = False, input "images", output
    "output", opset 13), done here because that script calls torch.onnx._export, which current PyTorch no longer has"""
    import torch
    from yolox.exp import get_exp
    exp = get_exp(o.exp, None)
    model = exp.get_model()
    ck = torch.load(o.ckpt, map_location="cpu")
    model.load_state_dict(ck["model"] if "model" in ck else ck)
    model.eval()
    model.head.decode_in_inference = False
    dummy = torch.randn(1, 3, exp.test_size[0], exp.test_size[1])
    torch.onnx.export(model, dummy, o.export, input_names=["images"], output_names=["output"], opset_version=13, dynamo=False)
    import onnx
    m = onnx.load(o.export)
    onnx.checker.check_model(m)
    print("onnx:", o.export, [(i.name, [d.dim_value for d in i.type.tensor_type.shape.dim]) for i in m.graph.input],
          [(x.name, [d.dim_value for d in x.type.tensor_type.shape.dim]) for x in m.graph.output])


if __name__ == "__main__":
    main()
