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
import sys


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--yolox", required=True)
    a.add_argument("-f", "--exp", required=True)
    a.add_argument("-c", "--ckpt", required=True)
    a.add_argument("-b", "--batch", type=int, default=16)
    a.add_argument("--device", choices=["cpu", "mps"], default="cpu")
    a.add_argument("--out", required=True)
    o = a.parse_args()
    sys.path.insert(0, o.yolox)
    import torch
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
    T.Trainer(exp, args).train()


if __name__ == "__main__":
    main()
